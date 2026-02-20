import React from 'react';

export default function Footer() {
    return (
        <footer className="footer">
            <div className="footer-left">
                <div className="footer-item">
                    <span>🏢</span> Apollo Hospitals, Sarita Vihar, Delhi
                </div>
                <div className="footer-item">
                    <span>📞</span> +91-11-2692-5858
                </div>
                <div className="footer-item">
                    <span>🚑</span> Emergency: 1066
                </div>
            </div>
            <a href="tel:1066" className="call-now-btn">
                <span>📞</span> Call Now
            </a>
        </footer>
    );
}
