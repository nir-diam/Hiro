
import React, { useState } from 'react';
import AccordionSection from './AccordionSection';
import { 
    PhoneIcon, EnvelopeIcon, MapPinIcon, LinkedInIcon,
    PencilIcon, CheckBadgeIcon, ArrowUpTrayIcon 
} from './Icons';

// Re-defining form components locally for a self-contained view
const FormInput: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; name: string; required?: boolean; type?: string; icon?: React.ReactNode; placeholder?: string }> = ({ label, value, onChange, name, required, type = "text", icon, placeholder }) => (
    <div>
        <label className="flex items-center text-sm font-semibold text-text-muted mb-1">
            {icon && <span className="text-text-subtle ml-2">{icon}</span>}
            {label} {required && <span className="text-red-500 mr-1">*</span>}
        </label>
        <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"/>
    </div>
);

const FormSelect: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; name: string; children: React.ReactNode }> = ({ label, value, onChange, name, children }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1">{label}</label>
        <select name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm">
            {children}
        </select>
    </div>
);


const NewCandidateView: React.FC<{ setActiveView: (view: string) => void; }> = ({ setActiveView }) => {
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        age: '',
        city: '',
        salary: '',
        source: '',
        phone: '',
        email: '',
        linkedin: '',
        summary: '',
        status: 'חדש',
        address: '',
        idNumber: '',
        maritalStatus: '-',
        gender: 'לא צוין',
        drivingLicense: '-',
        mobility: '-',
        tags: [] as string[],
    });
    const [tagInput, setTagInput] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'age') {
            // Allow only digits and limit length to 3 characters for age
            const numericValue = value.replace(/[^0-9]/g, '');
            setFormData(prev => ({ ...prev, [name]: numericValue }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTagInput(e.target.value);
    };

    const addTags = (newTags: string[]) => {
        const uniqueNewTags = newTags
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0 && !formData.tags.includes(tag));
        if (uniqueNewTags.length > 0) {
            setFormData(prev => ({ ...prev, tags: [...prev.tags, ...uniqueNewTags] }));
        }
    };

    const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const tagsToAdd = tagInput.split(',').filter(tag => tag.trim() !== '');
            addTags(tagsToAdd);
            setTagInput('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(tag => tag !== tagToRemove),
        }));
    };

    const handleSave = () => {
        console.log("Saving new candidate:", formData);
        alert('מועמד נשמר (סימולציה)');
        setActiveView('details');
    };

    return (
        <div className="space-y-6">
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-fade-in {
                    animation: fadeIn 0.2s ease-out;
                }
            `}</style>
            {/* --- Mimic CandidateProfile --- */}
            <div className="bg-gradient-to-br from-primary-100/50 via-bg-card to-primary-100/50 rounded-2xl shadow-lg p-6">
                <div className="flex flex-col lg:flex-row justify-between items-start gap-8">
                    {/* Right Side - Candidate Info Form */}
                    <div className="w-full lg:w-1/2 flex flex-col sm:flex-row items-center sm:items-start">
                        <div className="relative flex-shrink-0">
                            <div className="w-24 h-24 rounded-full bg-primary-200 flex items-center justify-center text-primary-500 text-4xl font-bold border-4 border-bg-card shadow-lg">
                                ?
                            </div>
                        </div>
                        <div className="sm:mr-6 flex-1 text-center sm:text-right mt-4 sm:mt-0">
                             <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start mb-2 gap-2">
                                <div className="flex items-center">
                                    <CheckBadgeIcon className="w-7 h-7 text-text-subtle ml-2" />
                                    <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} placeholder="שם פרטי" className="bg-transparent text-text-default text-3xl font-extrabold text-right border-b-2 border-border-default focus:border-primary-500 outline-none w-40" />
                                    <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} placeholder="משפחה" className="bg-transparent text-text-default text-3xl font-extrabold text-right border-b-2 border-border-default focus:border-primary-500 outline-none w-40 ml-2" />
                                </div>
                                <span className="text-text-muted text-lg flex items-center">
                                    (<input type="text" name="city" value={formData.city} onChange={handleChange} placeholder="עיר" className="w-24 bg-transparent border-b-2 border-border-default outline-none focus:border-primary-500 text-right" />
                                    <span className="mx-1">•</span>
                                    <input type="text" inputMode="numeric" maxLength={3} name="age" value={formData.age} onChange={handleChange} placeholder="גיל" className="w-10 text-center bg-transparent border-b-2 border-border-default outline-none focus:border-primary-500" />)
                                </span>
                            </div>
                            <div className="flex items-center justify-center sm:justify-start gap-2 mt-4 flex-wrap">
                               <div className="relative">
                                    <PhoneIcon className="w-5 h-5 text-primary-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
                                    <input name="phone" value={formData.phone} onChange={handleChange} placeholder="טלפון" className="w-32 p-2 pr-10 bg-primary-100/70 rounded-lg text-primary-700 outline-none focus:ring-2 focus:ring-primary-400 transition" />
                                </div>
                                <div className="relative">
                                    <EnvelopeIcon className="w-5 h-5 text-primary-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
                                    <input name="email" value={formData.email} onChange={handleChange} placeholder="אימייל" className="w-48 p-2 pr-10 bg-primary-100/70 rounded-lg text-primary-700 outline-none focus:ring-2 focus:ring-primary-400 transition" />
                                </div>
                                <div className="relative">
                                    <LinkedInIcon className="w-5 h-5 text-primary-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
                                    <input name="linkedin" value={formData.linkedin} onChange={handleChange} placeholder="לינקדאין" className="w-32 p-2 pr-10 bg-primary-100/70 rounded-lg text-primary-700 outline-none focus:ring-2 focus:ring-primary-400 transition" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Left Side - Tags */}
                    <div className="w-full lg:w-1/2 flex flex-col justify-center items-center pt-4 space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-2">הוסף תגיות (מופרד בפסיק)</label>
                            <input 
                                type="text" 
                                value={tagInput}
                                onChange={handleTagInputChange}
                                onKeyDown={handleTagInputKeyDown}
                                placeholder="ניהול, שיווק, מכירות..." 
                                className="w-full bg-bg-card/70 border border-border-default text-text-default text-sm font-medium px-4 py-1.5 rounded-full shadow-sm focus:ring-primary-500 focus:border-primary-500" 
                            />
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2 min-h-[40px] w-full">
                            {formData.tags.map((tag, index) => (
                                <span key={index} className="flex items-center bg-primary-100 text-primary-800 text-sm font-medium pl-3 pr-2 py-1 rounded-full animate-fade-in">
                                    {tag}
                                    <button 
                                        onClick={() => removeTag(tag)} 
                                        className="mr-1.5 text-primary-500 hover:text-primary-700"
                                        aria-label={`Remove ${tag}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Mimic MainContent and ResumeViewer grid --- */}
            <div className="bg-bg-card rounded-2xl shadow-sm">
                <div className="grid grid-cols-1 lg:grid-cols-2">
                    {/* Main Content Form */}
                    <div className="lg:border-l lg:border-border-default">
                        <div className="p-4 md:p-6 lg:p-8 space-y-6">
                            <AccordionSection title="פרטים אישיים" icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                    <FormSelect label="סטטוס המועמד" name="status" value={formData.status} onChange={handleChange}><option>חדש</option><option>בתהליך</option></FormSelect>
                                    <FormInput label="כתובת" name="address" value={formData.address} onChange={handleChange} required icon={<MapPinIcon className="w-4 h-4" />} />
                                    <FormInput label="תעודת זהות" name="idNumber" value={formData.idNumber} onChange={handleChange} />
                                    <FormSelect label="מצב משפחתי" name="maritalStatus" value={formData.maritalStatus} onChange={handleChange}>
                                        <option value="-">-</option>
                                        <option value="רווק/ה">רווק/ה</option>
                                        <option value="נשוי/אה">נשוי/אה</option>
                                        <option value="גרוש/ה">גרוש/ה</option>
                                        <option value="אלמן/ה">אלמן/ה</option>
                                        <option value="ידוע/ה בציבור">ידוע/ה בציבור</option>
                                    </FormSelect>
                                    <FormSelect label="מין" name="gender" value={formData.gender} onChange={handleChange}>
                                        <option>זכר</option>
                                        <option>נקבה</option>
                                    </FormSelect>
                                    <FormSelect label="רישיון נהיגה" name="drivingLicense" value={formData.drivingLicense} onChange={handleChange}>
                                        <option value="-">ללא</option>
                                        <option value="A">A (אופנוע)</option>
                                        <option value="A1">A1</option>
                                        <option value="A2">A2</option>
                                        <option value="B">B (רכב פרטי)</option>
                                        <option value="C">C (משאית)</option>
                                        <option value="C1">C1</option>
                                        <option value="D">D (אוטובוס)</option>
                                        <option value="D1">D1</option>
                                        <option value="E">E (גורר)</option>
                                        <option value="1">1 (טרקטור)</option>
                                    </FormSelect>
                                     <FormSelect label="ניידות" name="mobility" value={formData.mobility} onChange={handleChange}>
                                        <option value="-">-</option>
                                        <option value="כן">כן</option>
                                        <option value="לא">לא</option>
                                        <option value="בעל/ת רכב">בעל/ת רכב</option>
                                    </FormSelect>
                                </div>
                            </AccordionSection>

                            {/* Other accordions can be added here */}

                            <div className="flex justify-end space-x-3 pt-4">
                                <button type="button" onClick={() => setActiveView('details')} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition">ביטול</button>
                                <button type="button" onClick={handleSave} className="bg-primary-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-600 transition shadow-sm">שמור מועמד</button>
                            </div>
                        </div>
                    </div>
                    
                    {/* Resume Upload Area */}
                    <div className="p-4 md:p-6 lg:p-8 flex items-center justify-center">
                        <div className="w-full h-full">
                            <h3 className="text-lg font-bold text-text-default mb-4">קורות חיים ומסמכים</h3>
                            <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-64 border-2 border-border-default border-dashed rounded-lg cursor-pointer bg-bg-subtle hover:bg-bg-hover">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <ArrowUpTrayIcon className="w-8 h-8 mb-4 text-text-subtle" />
                                    <p className="mb-2 text-sm text-text-muted"><span className="font-semibold">לחץ להעלאה</span> או גרור קובץ</p>
                                    <p className="text-xs text-text-subtle">PDF, DOCX, PNG, JPG</p>
                                </div>
                                <input id="dropzone-file" type="file" className="hidden" />
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewCandidateView;
