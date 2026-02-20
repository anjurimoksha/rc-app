import { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const EMPTY_MED = { name: '', dosage: '', frequency: '', duration: '' };

export default function PrescriptionModal({ patientId, patientName, onClose }) {
    const { currentUser, userData } = useAuth();
    const fileInputRef = useRef(null);

    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [ocrStatus, setOcrStatus] = useState(null); // null | 'reading' | 'done'
    const [extractedText, setExtractedText] = useState('');
    const [editedText, setEditedText] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const [form, setForm] = useState({
        prescriptionDate: new Date().toISOString().split('T')[0],
        diagnosisNotes: '',
        followUpDate: '',
        documentType: 'Prescription',
    });
    const [medications, setMedications] = useState([{ ...EMPTY_MED }]);

    function handleImageChange(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        runOCR(file);
    }

    async function runOCR(file) {
        setOcrStatus('reading');
        try {
            const result = await Tesseract.recognize(file, 'eng', {
                logger: m => { if (m.status === 'recognizing text') setOcrStatus(`reading`); }
            });
            const text = result.data.text || '';
            setExtractedText(text);
            setEditedText(text);
        } catch (err) {
            console.error('OCR error:', err);
            setExtractedText('OCR failed — please type the prescription text manually.');
            setEditedText('');
        }
        setOcrStatus('done');
    }

    function updateMed(i, field, val) {
        setMedications(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m));
    }
    function addMed() { setMedications(prev => [...prev, { ...EMPTY_MED }]); }
    function removeMed(i) { setMedications(prev => prev.filter((_, idx) => idx !== i)); }

    async function handleSave(e) {
        e.preventDefault();
        if (!patientId) return;
        setSaving(true);
        try {
            let imageUrl = '';
            // Upload image to Firebase Storage
            if (imageFile) {
                const prescriptionId = `${Date.now()}`;
                const storageRef = ref(storage, `prescriptions/${patientId}/${prescriptionId}.jpg`);
                await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(storageRef);
            }

            // Save prescription to Firestore
            const prescRef = await addDoc(collection(db, 'prescriptions'), {
                patientId,
                doctorId: currentUser.uid,
                doctorName: userData?.name || '',
                prescriptionDate: form.prescriptionDate,
                imageUrl,
                extractedText,
                editedText,
                medications: medications.filter(m => m.name.trim()),
                diagnosisNotes: form.diagnosisNotes,
                documentType: form.documentType,
                followUpDate: form.followUpDate || null,
                createdAt: serverTimestamp(),
            });

            // Also write to medicalVisits so it shows in Medical History
            await addDoc(collection(db, 'medicalVisits'), {
                patientId,
                doctorId: currentUser.uid,
                doctorName: userData?.name || '',
                hospital: userData?.hospital || 'Apollo Hospitals',
                department: 'General Medicine',
                visitDate: form.prescriptionDate,
                diagnosis: form.diagnosisNotes || editedText.slice(0, 80),
                tags: [form.documentType],
                medications: medications.filter(m => m.name.trim()).map(m => ({ ...m, status: 'active', instructions: '' })),
                followUpInstructions: form.followUpDate ? [`Follow-up on ${form.followUpDate}`] : [],
                doctorNotes: editedText,
                prescriptionId: prescRef.id,
                imageUrl,
                ward: 'OPD', duration: '—',
                createdAt: serverTimestamp(),
            });

            // Notify patient
            await addDoc(collection(db, 'notifications', patientId, 'items'), {
                type: 'new_prescription',
                title: '💊 New Prescription Added',
                message: `Dr. ${userData?.name} has added a new ${form.documentType.toLowerCase()} for you.`,
                doctorName: userData?.name,
                timestamp: serverTimestamp(),
                read: false,
            });

            setSaved(true);
        } catch (err) {
            console.error('Save error:', err);
            alert('Failed to save: ' + err.message);
        } finally {
            setSaving(false);
        }
    }

    const inputSm = { fontSize: '0.83rem', padding: '7px 10px' };

    if (saved) {
        return (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
                <div className="modal" style={{ maxWidth: 440, textAlign: 'center', padding: '2.5rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
                    <h3 style={{ color: 'var(--primary)', marginBottom: 8 }}>Prescription Saved!</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                        The prescription has been added to <strong>{patientName}</strong>'s medical history and they have been notified.
                    </p>
                    <button className="btn btn-accent btn-full" onClick={onClose}>Close</button>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 680, width: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 10 }}>
                    <div>
                        <h3>📷 Add Prescription — {patientName}</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>Upload or take a photo; OCR will extract the text.</p>
                    </div>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    {/* Image Upload */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: '1.2rem' }}>
                        <button
                            type="button"
                            className="btn btn-outline"
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                            onClick={() => { fileInputRef.current.removeAttribute('capture'); fileInputRef.current.click(); }}
                        >
                            📁 Upload Image
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline"
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                            onClick={() => { fileInputRef.current.setAttribute('capture', 'environment'); fileInputRef.current.click(); }}
                        >
                            📷 Take Photo
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleImageChange}
                        />
                    </div>

                    {/* Preview + OCR */}
                    {imagePreview && (
                        <div style={{ display: 'flex', gap: 12, marginBottom: '1.2rem', alignItems: 'flex-start' }}>
                            <img src={imagePreview} alt="Prescription" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                {ocrStatus === 'reading' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 600 }}>
                                        <div className="spinner" style={{ width: 18, height: 18, margin: 0 }} /> Reading prescription...
                                    </div>
                                )}
                                {ocrStatus === 'done' && (
                                    <div>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                                            Extracted Text (editable)
                                        </div>
                                        <textarea
                                            className="form-input"
                                            rows={5}
                                            style={{ fontSize: '0.82rem', resize: 'vertical' }}
                                            value={editedText}
                                            onChange={e => setEditedText(e.target.value)}
                                            placeholder="OCR extracted text — correct any errors here..."
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Structured Form */}
                    <form onSubmit={handleSave}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px', marginBottom: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, display: 'block', marginBottom: 4 }}>Prescription Date</label>
                                <input className="form-input" type="date" style={inputSm} value={form.prescriptionDate} onChange={e => setForm(p => ({ ...p, prescriptionDate: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, display: 'block', marginBottom: 4 }}>Document Type</label>
                                <select className="form-input" style={inputSm} value={form.documentType} onChange={e => setForm(p => ({ ...p, documentType: e.target.value }))}>
                                    <option>Prescription</option><option>Lab Report</option>
                                    <option>Discharge Summary</option><option>Other</option>
                                </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, display: 'block', marginBottom: 4 }}>Diagnosis / Clinical Notes</label>
                                <textarea className="form-input" style={{ ...inputSm, resize: 'vertical' }} rows={3}
                                    placeholder="e.g. Acute Appendicitis — post-surgical recovery"
                                    value={form.diagnosisNotes} onChange={e => setForm(p => ({ ...p, diagnosisNotes: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, display: 'block', marginBottom: 4 }}>Follow-up Date (optional)</label>
                                <input className="form-input" type="date" style={inputSm} value={form.followUpDate} onChange={e => setForm(p => ({ ...p, followUpDate: e.target.value }))} />
                            </div>
                        </div>

                        {/* Medications */}
                        <div style={{ marginBottom: '1.2rem' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.7, marginBottom: 8 }}>💊 Medication(s)</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1fr auto', gap: '4px 8px', marginBottom: 6 }}>
                                {['Medication Name', 'Dosage', 'Frequency', 'Duration', ''].map(h => (
                                    <div key={h} style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</div>
                                ))}
                            </div>
                            {medications.map((m, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1fr auto', gap: '4px 8px', marginBottom: 6 }}>
                                    <input className="form-input" style={inputSm} placeholder="e.g. Amoxicillin" value={m.name} onChange={e => updateMed(i, 'name', e.target.value)} />
                                    <input className="form-input" style={inputSm} placeholder="500mg" value={m.dosage} onChange={e => updateMed(i, 'dosage', e.target.value)} />
                                    <input className="form-input" style={inputSm} placeholder="Twice daily" value={m.frequency} onChange={e => updateMed(i, 'frequency', e.target.value)} />
                                    <input className="form-input" style={inputSm} placeholder="7 days" value={m.duration} onChange={e => updateMed(i, 'duration', e.target.value)} />
                                    <button type="button" onClick={() => removeMed(i)} style={{ background: 'var(--danger-light)', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--danger)', fontWeight: 700, padding: '4px 8px' }}>✕</button>
                                </div>
                            ))}
                            <button type="button" className="btn btn-sm btn-outline" onClick={addMed} style={{ marginTop: 4 }}>+ Add Medication</button>
                        </div>

                        <button
                            className="btn btn-accent btn-full"
                            type="submit"
                            disabled={saving}
                            style={{ padding: '14px', fontSize: '1rem', fontWeight: 700 }}
                        >
                            {saving ? 'Saving...' : '💾 Save to Patient Record'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
