import React, { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, LinkIcon, PencilIcon } from './Icons';
import AccordionSection from './AccordionSection'; // Import AccordionSection

// Reusable local components for this view
const FormInput: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ label, name, value, onChange }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <input type="text" name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
    </div>
);

const FormSelect: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode }> = ({ label, name, value, onChange, children }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <select name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5">
            {children}
        </select>
    </div>
);

const FormTextArea: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; rows?: number }> = ({ label, name, value, onChange, rows = 4 }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <textarea name={name} value={value} onChange={onChange} rows={rows} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"></textarea>
    </div>
);

const InfoTag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="bg-secondary-100 text-secondary-800 text-xs font-semibold px-2.5 py-1 rounded-full">
        {children}
    </span>
);


const allRecruiters = ['דנה כהן', 'אביב לוי', 'יעל שחר', 'מיכל אלקבץ'];

const ClientDetailsTab: React.FC = () => {
    const [formData, setFormData] = useState({
        clientName: 'גטר גרופ',
        clientType: 'לקוח פעיל',
        clientId: '',
        accountManager: '',
        recruiters: ['דנה כהן'],
        internalNotes: '',
    });
    const [isRecruiterDropdownOpen, setIsRecruiterDropdownOpen] = useState(false);
    const recruiterRef = useRef<HTMLDivElement>(null);

     useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (recruiterRef.current && !recruiterRef.current.contains(event.target as Node)) {
                setIsRecruiterDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleRecruiterChange = (recruiter: string) => {
        setFormData(prev => ({
            ...prev,
            recruiters: prev.recruiters.includes(recruiter)
                ? prev.recruiters.filter(r => r !== recruiter)
                : [...prev.recruiters, recruiter]
        }));
    };

    return (
        <div className="space-y-6">
            <AccordionSection title="מידע על החברה" icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                 <div className="space-y-4 text-sm">
                    <p className="text-text-muted leading-relaxed">
                        קבוצה ותיקה המתמחה בייבוא והפצת ציוד טכנולוגי, כולל מחשוב, תקשורת, דפוס וציוד רפואי.
                    </p>
                    <div>
                        <h4 className="font-semibold text-text-default mb-2">מוצרים ושירותים:</h4>
                        <div className="flex flex-wrap gap-2">
                            <InfoTag>ציוד מחשוב</InfoTag>
                            <InfoTag>תקשורת</InfoTag>
                            <InfoTag>דפוס</InfoTag>
                            <InfoTag>ציוד רפואה</InfoTag>
                            <InfoTag>הפצה טכנולוגית</InfoTag>
                        </div>
                    </div>
                    <dl className="space-y-2 pt-2 border-t border-border-default">
                        <div className="flex justify-between"><dt className="text-text-muted">תעשייה:</dt><dd className="font-semibold text-right">מסחר וקמעונאות &gt; יבוא וסחר סיטונאי</dd></div>
                        <div className="flex justify-between"><dt className="text-text-muted">כמות עובדים:</dt><dd className="font-semibold">501-1000</dd></div>
                        <div className="flex justify-between"><dt className="text-text-muted">סוג בעלות:</dt><dd className="font-semibold">פרטית</dd></div>
                        <div className="flex justify-between"><dt className="text-text-muted">מיקום:</dt><dd className="font-semibold">פתח תקווה</dd></div>
                        <div className="flex justify-between items-center"><dt className="text-text-muted">אתר:</dt><dd><a href="https://www.getter.co.il/" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline font-semibold flex items-center gap-1"><span>getter.co.il</span> <LinkIcon className="w-4 h-4" /></a></dd></div>
                    </dl>
                 </div>
            </AccordionSection>
            
            <AccordionSection title="ניהול לקוח" icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><strong className="text-text-muted">מס' לקוח:</strong> <span className="font-semibold">383</span></div>
                        <div><strong className="text-text-muted">נוצר:</strong> <span className="font-semibold">11/11/2025</span></div>
                    </div>
                    <FormInput label="שם הלקוח" name="clientName" value={formData.clientName} onChange={handleChange} />
                    <FormSelect label="סוג לקוח" name="clientType" value={formData.clientType} onChange={handleChange}>
                        <option>לקוח פעיל</option>
                        <option>לקוח כללי</option>
                        <option>מתעניין</option>
                        <option>לא פעיל</option>
                    </FormSelect>
                     <FormInput label="מנהל תיקי לקוחות" name="accountManager" value={formData.accountManager} onChange={handleChange} />
                    <div className="relative" ref={recruiterRef}>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">רכז גיוס</label>
                        <button type="button" onClick={() => setIsRecruiterDropdownOpen(!isRecruiterDropdownOpen)} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 text-right flex justify-between items-center">
                            <span className="truncate">{formData.recruiters.length > 0 ? formData.recruiters.join(', ') : 'בחר רכזים'}</span>
                            <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform ${isRecruiterDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isRecruiterDropdownOpen && (
                            <div className="absolute z-10 w-full mt-1 bg-bg-card border border-border-default rounded-lg shadow-lg">
                                {allRecruiters.map(recruiter => (
                                    <label key={recruiter} className="flex items-center gap-2 p-2 text-sm text-text-default hover:bg-bg-hover cursor-pointer">
                                        <input type="checkbox" checked={formData.recruiters.includes(recruiter)} onChange={() => handleRecruiterChange(recruiter)} className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500 bg-bg-card" />
                                        {recruiter}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                     <FormTextArea label="הערה פנימית" name="internalNotes" value={formData.internalNotes} onChange={handleChange} />
                     <div className="flex justify-end pt-2">
                        <button className="bg-primary-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-700 transition">שמור שינויים</button>
                    </div>
                </div>
            </AccordionSection>
        </div>
    );
};

export default ClientDetailsTab;