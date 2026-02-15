import React from 'react';

interface OriginalResumeProps {
    highlighted?: boolean;
    resumeData: {
        name: string;
        contact: string;
        summary?: string;
        experience?: string[];
        education?: string[];
        resumeUrl?: string;
    };
}

const decodeHtmlEntities = (value?: string) => {
    if (!value) return '';
    if (typeof window === 'undefined') return value;
    const parser = new DOMParser();
    const doc = parser.parseFromString(value, 'text/html');
    return doc.documentElement.textContent || '';
};

const OriginalResume: React.FC<OriginalResumeProps> = ({ resumeData }) => {
    const { name, contact, resumeUrl } = resumeData || {};
    const isImage = !!(resumeUrl && /\.(png|jpe?g)$/i.test(resumeUrl));

    return (
        <div className="p-4 bg-bg-card border border-border-default font-serif text-text-default" style={{direction: 'rtl'}}>
            <h3 className="text-xl font-bold mb-4 text-center">{name || 'קורות חיים'}</h3>
            <div className="text-center text-sm mb-6 border-b border-border-default pb-4 text-text-muted">
                <p>{contact || ''}</p>
            </div>
            <div className="space-y-4">
                {resumeUrl ? (
                    <>
                        <div className="min-h-[60vh] border border-border-default rounded-2xl overflow-hidden bg-black/5">
                            {isImage ? (
                                <img src={resumeUrl} alt="קורות חיים" className="object-contain w-full h-full" />
                            ) : (
                                <iframe src={resumeUrl} title="Original resume" className="w-full h-full" />
                            )}
                        </div>
                        <div className="text-center text-xs text-text-muted">
                            נתקעת?
                            <a
                                className="text-primary-600 font-bold underline px-1"
                                href={resumeUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                הורד את הקובץ המקורי
                            </a>
                        </div>
                    </>
                ) : (
                    <div className="text-center text-text-muted text-sm">
                        אין קובץ קורות חיים להצגה.
                    </div>
                )}
            </div>
        </div>
    );
};

export default OriginalResume;