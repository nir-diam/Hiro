
import React, { useId, useState } from 'react';
import AccordionSection from './AccordionSection';
import ContentNavBar from './ContentNavBar';
import { ClipboardDocumentCheckIcon, TagIcon, PencilIcon, SparklesIcon, CalendarDaysIcon, AcademicCapIcon, LanguageIcon, WalletIcon, ChatBubbleOvalLeftEllipsisIcon, EnvelopeIcon, MapPinIcon, PlusIcon, TrashIcon, BriefcaseIcon, LockClosedIcon, XMarkIcon } from './Icons';
import WorkExperienceSection from './WorkExperienceSection';
import { TagInput } from './TagInput';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import { useLanguage } from '../context/LanguageContext';

const FormInput: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; required?: boolean; type?: string; icon?: React.ReactNode }> = ({ label, name, value, onChange, required, type = "text", icon }) => {
    const id = useId();
    return (
        <div>
            <label htmlFor={id} className="flex items-center text-sm font-semibold text-text-muted mb-1">
                {label} {required && <span className="text-red-500 mr-1">*</span>}
                {icon && <span className="text-gray-400 mr-2">{icon}</span>}
            </label>
            <input id={id} type={type} name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"/>
        </div>
    );
};

const FormSelect: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode }> = ({ label, name, value, onChange, children }) => {
    const id = useId();
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-semibold text-text-muted mb-1">{label}</label>
            <select id={id} name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm">
                {children}
            </select>
        </div>
    );
};

const SkillSlider: React.FC<{ label: string; level: number, levelText: string; onChange: (level: number) => void }> = ({ label, level, levelText, onChange }) => (
    <div>
        <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-text-muted">{label}</label>
            <span className="text-sm font-semibold text-primary-600">{levelText}</span>
        </div>
        <div className="relative pt-1">
            <input type="range" min="1" max="100" value={level} onChange={(e) => onChange(parseInt(e.target.value, 10))} className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500" />
        </div>
    </div>
);

const Tag: React.FC<{ children: React.ReactNode; onRemove: () => void; }> = ({ children, onRemove }) => (
    <span className="flex items-center bg-primary-100 text-primary-800 text-sm font-medium pl-3 pr-2 py-1 rounded-full">
        {children}
        <button onClick={onRemove} className="mr-1.5 text-primary-500 hover:text-primary-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
    </span>
);

interface MainContentProps {
    formData: any;
    onFormChange: (updatedData: any) => void;
    onImmediateSave?: (patch: any) => void;
    onInternalTagsChange?: (tags: string[]) => void;
    viewMode?: 'recruiter' | 'candidate';
}

const getLevelText = (level: number): string => {
    if (level >= 90) return "שפת אם / מעולה";
    if (level >= 70) return "טוב מאוד";
    if (level >= 50) return "טוב";
    if (level >= 30) return "בסיסי";
    return "חלש";
};

const MainContent: React.FC<MainContentProps> = ({ formData, onFormChange, onImmediateSave, onInternalTagsChange, viewMode = 'recruiter' }) => {
    const { t } = useLanguage();
    const summaryId = useId();
    const recruiterNotesId = useId();
    const candidateNotesId = useId();
    
    // States for new item inputs
    const [newLanguageName, setNewLanguageName] = useState('');
    const [newEducation, setNewEducation] = useState('');
    const [editingEducation, setEditingEducation] = useState<{id: number, value: string} | null>(null);
    const [newSoftSkill, setNewSoftSkill] = useState('');
    const [newTechSkill, setNewTechSkill] = useState({ name: '', level: 50 });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        onFormChange({ ...formData, [name]: value });
    };

    const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const numericValue = parseInt(value, 10);
        let newMin = formData.salaryMin;
        let newMax = formData.salaryMax;
        const maxRange = 2000;

        if (name === 'salaryMin') {
            newMin = numericValue;
            if (newMin > newMax) {
                newMax = newMin; // If min goes past max, they become equal
            } else if (newMax - newMin > maxRange) {
                newMax = newMin + maxRange; // If range exceeds max, pull max closer
            }
        } else if (name === 'salaryMax') {
            newMax = numericValue;
            if (newMax < newMin) {
                newMin = newMax; // If max goes below min, they become equal
            } else if (newMax - newMin > maxRange) {
                newMin = newMax - maxRange; // If range exceeds max, push min up
            }
        }
        
        onFormChange({ ...formData, salaryMin: newMin, salaryMax: newMax });
    };

    // --- Language Handlers ---
    const handleLanguageLevelChange = (id: number, newLevel: number) => {
        const updatedLanguages = formData.languages.map((lang: any) => 
            lang.id === id ? { ...lang, level: newLevel, levelText: getLevelText(newLevel) } : lang
        );
        onFormChange({ ...formData, languages: updatedLanguages });
    };

    const handleAddLanguage = () => {
        if (newLanguageName.trim()) {
            const newLang = { id: Date.now(), name: newLanguageName, level: 50, levelText: getLevelText(50) };
            onFormChange({ ...formData, languages: [...formData.languages, newLang] });
            setNewLanguageName('');
        }
    };
    
    const handleRemoveLanguage = (id: number) => {
        onFormChange({ ...formData, languages: formData.languages.filter((lang: any) => lang.id !== id) });
    };

    // --- Education Handlers ---
    const handleAddEducation = () => {
        if (newEducation.trim()) {
            const newEdu = { id: Date.now(), value: newEducation };
            onFormChange({ ...formData, education: [...formData.education, newEdu] });
            setNewEducation('');
        }
    };

    const handleRemoveEducation = (id: number) => {
        onFormChange({ ...formData, education: formData.education.filter((edu: any) => edu.id !== id) });
    };

    const handleUpdateEducation = () => {
        if (editingEducation) {
            onFormChange({ ...formData, education: formData.education.map((edu: any) => edu.id === editingEducation.id ? editingEducation : edu) });
            setEditingEducation(null);
        }
    };
    
    // --- Soft Skills Handlers ---
    const handleAddSoftSkill = () => {
        const incoming = newSoftSkill.trim();
        const current = Array.isArray(formData.softSkills) ? formData.softSkills : [];
        if (incoming && !current.includes(incoming)) {
            const updated = [...current, incoming];
            onFormChange({ ...formData, softSkills: updated, skills: { ...(formData.skills || {}), soft: updated, technical: formData.skills?.technical || formData.techSkills || [] } });
            onImmediateSave?.({ softSkills: updated, skills: { soft: updated, technical: formData.skills?.technical || formData.techSkills || [] } });
            setNewSoftSkill('');
        }
    };
    const handleRemoveSoftSkill = (skillToRemove: string) => {
        const current = Array.isArray(formData.softSkills) ? formData.softSkills : [];
        const updated = current.filter((skill: string) => skill !== skillToRemove);
        onFormChange({ ...formData, softSkills: updated, skills: { ...(formData.skills || {}), soft: updated, technical: formData.skills?.technical || formData.techSkills || [] } });
        onImmediateSave?.({ softSkills: updated, skills: { soft: updated, technical: formData.skills?.technical || formData.techSkills || [] } });
    };

    // --- Tech Skills Handlers ---
    const handleTechSkillLevelChange = (id: number, newLevel: number) => {
        const current = Array.isArray(formData.techSkills) ? formData.techSkills : [];
        const updatedSkills = current.map((skill: any) => 
            skill.id === id ? { ...skill, level: newLevel, levelText: getLevelText(newLevel) } : skill
        );
        onFormChange({ ...formData, techSkills: updatedSkills, skills: { ...(formData.skills || {}), technical: updatedSkills, soft: formData.skills?.soft || formData.softSkills || [] } });
        onImmediateSave?.({ techSkills: updatedSkills, skills: { technical: updatedSkills, soft: formData.skills?.soft || formData.softSkills || [] } });
    };

    const handleAddTechSkill = () => {
        const name = newTechSkill.name.trim();
        const current = Array.isArray(formData.techSkills) ? formData.techSkills : [];
        if (!name) return;
        const newSkill = { ...newTechSkill, name, id: Date.now(), levelText: getLevelText(newTechSkill.level) };
        const updated = [...current, newSkill];
        onFormChange({ ...formData, techSkills: updated, skills: { ...(formData.skills || {}), technical: updated, soft: formData.skills?.soft || formData.softSkills || [] } });
        onImmediateSave?.({ techSkills: updated, skills: { technical: updated, soft: formData.skills?.soft || formData.softSkills || [] } });
        setNewTechSkill({ name: '', level: 50 });
    };
    
    const handleRemoveTechSkill = (id: number) => {
        const current = Array.isArray(formData.techSkills) ? formData.techSkills : [];
        const updated = current.filter((skill: any) => skill.id !== id);
        onFormChange({ ...formData, techSkills: updated, skills: { ...(formData.skills || {}), technical: updated, soft: formData.skills?.soft || formData.softSkills || [] } });
        onImmediateSave?.({ techSkills: updated, skills: { technical: updated, soft: formData.skills?.soft || formData.softSkills || [] } });
    };
    
    const handleWorkExperienceChange = (newExperience: any) => {
        onFormChange({ ...formData, workExperience: newExperience });
    };


    return (
        <div className="space-y-6">
            {viewMode === 'recruiter' && <ContentNavBar />}
            
            {viewMode === 'recruiter' && (
                <div id="summary">
                    <AccordionSection title={t('section.summary')} icon={<ClipboardDocumentCheckIcon className="w-5 h-5"/>} defaultOpen>
                        <label htmlFor={summaryId} className="sr-only">{t('section.summary')}</label>
                        <textarea 
                            id={summaryId}
                            className="w-full h-32 bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                            placeholder={t('section.summary_placeholder')}
                        ></textarea>
                    </AccordionSection>
                </div>
            )}

            <div id="personal-details">
                <AccordionSection title={t('section.personal_details')} icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <FormInput label={t('form.full_name')} name="fullName" value={formData.fullName} onChange={handleInputChange} required />
                        {viewMode === 'recruiter' && <FormSelect label={t('form.status')} name="status" value={formData.status} onChange={handleInputChange}><option>חדש</option><option>עבר בדיקה ראשונית</option></FormSelect>}
                        <FormInput label={t('form.phone')} name="phone" value={formData.phone} onChange={handleInputChange} required />
                        <FormInput label={t('form.email')} name="email" value={formData.email} onChange={handleInputChange} type="email" icon={<EnvelopeIcon className="w-4 h-4" />}/>
                        <FormInput label={t('form.address')} name="address" value={formData.address} onChange={handleInputChange} required icon={<MapPinIcon className="w-4 h-4" />} />
                        <FormInput label={t('form.id_number')} name="idNumber" value={formData.idNumber} onChange={handleInputChange} />
                        
                        <FormSelect label={t('form.marital_status')} name="maritalStatus" value={formData.maritalStatus} onChange={handleInputChange}>
                            <option value="-">-</option>
                            <option value="רווק/ה">רווק/ה</option>
                            <option value="נשוי/אה">נשוי/אה</option>
                            <option value="גרוש/ה">גרוש/ה</option>
                            <option value="אלמן/ה">אלמן/ה</option>
                            <option value="ידוע/ה בציבור">ידוע/ה בציבור</option>
                        </FormSelect>
                        
                        <FormSelect label={t('form.gender')} name="gender" value={formData.gender} onChange={handleInputChange}>
                            <option>זכר</option>
                            <option>נקבה</option>
                        </FormSelect>
                        
                        <FormSelect label={t('form.driving_license')} name="drivingLicense" value={formData.drivingLicense} onChange={handleInputChange}>
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
                        
                         <FormSelect label={t('form.mobility')} name="mobility" value={formData.mobility} onChange={handleInputChange}>
                            <option value="-">-</option>
                            <option value="כן">כן</option>
                            <option value="לא">לא</option>
                            <option value="בעל/ת רכב">בעל/ת רכב</option>
                        </FormSelect>
                    </div>
                </AccordionSection>
            </div>

            <div id="work-experience">
                <AccordionSection title={t('section.work_experience')} icon={<BriefcaseIcon className="w-5 h-5"/>} defaultOpen>
                    <WorkExperienceSection 
                        experience={Array.isArray(formData.workExperience) ? formData.workExperience : []}
                        onExperienceChange={handleWorkExperienceChange}
                    />
                </AccordionSection>
            </div>

            <div id="preferences">
                <AccordionSection title={t('section.preferences')} icon={<SparklesIcon className="w-5 h-5"/>} defaultOpen>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormSelect label={t('form.employment_type')} name="employmentType" value={formData.employmentType} onChange={handleInputChange}><option>שכיר</option></FormSelect>
                        <FormSelect label={t('form.job_scope')} name="jobScope" value={formData.jobScope} onChange={handleInputChange}><option>מלאה</option></FormSelect>
                        <FormSelect label={t('form.availability')} name="availability" value={formData.availability} onChange={handleInputChange}>
                        <option >בחר</option>
                            <option value="🟢 מיידי (זמין לעבודה מיד).">🟢 מיידי (זמין לעבודה מיד).</option>
                            <option value="🟡 חודש הודעה (עובד, מחפש אקטיבית).">🟡 חודש הודעה (עובד, מחפש אקטיבית).</option>
                            <option value="🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting).">🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting).</option>
                            <option value="🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים).">🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים).</option>
                        </FormSelect>
                        <FormSelect label={t('form.physical_work')} name="physicalWork" value={formData.physicalWork} onChange={handleInputChange}><option>כן/לא/פיזית מתונה</option></FormSelect>
                    </div>
                </AccordionSection>
            </div>
            
            <div id="salary">
                <AccordionSection title={t('section.salary')} icon={<WalletIcon className="w-5 h-5"/>} defaultOpen>
                     <div className="p-4 space-y-4">
                        <div className="flex justify-center items-center text-lg font-bold space-x-4">
                            {formData.salaryMin === formData.salaryMax ? (
                                <span className="text-primary-600 text-2xl">{formData.salaryMin.toLocaleString()} ₪</span>
                            ) : (
                                <>
                                    <span className="text-text-muted">מ-</span>
                                    <span className="text-primary-600">{formData.salaryMin.toLocaleString()} ₪</span>
                                    <span className="text-text-muted">עד-</span>
                                    <span className="text-primary-600">{formData.salaryMax.toLocaleString()} ₪</span>
                                </>
                            )}
                        </div>
                        <div className="relative h-8 flex items-center">
                            <div className="absolute w-full h-1.5 bg-bg-subtle rounded-full">
                                <div
                                    className="absolute h-1.5 bg-primary-500 rounded-full"
                                    style={{
                                        right: `${((formData.salaryMin - 5000) / 45000) * 100}%`,
                                        left: `${100 - ((formData.salaryMax - 5000) / 45000) * 100}%`
                                    }}
                                ></div>
                            </div>
                            <input
                                type="range"
                                min="5000"
                                max="50000"
                                step="1000"
                                value={formData.salaryMin}
                                name="salaryMin"
                                onChange={handleSalaryChange}
                                className="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto"
                            />
                             <input
                                type="range"
                                min="5000"
                                max="50000"
                                step="1000"
                                value={formData.salaryMax}
                                name="salaryMax"
                                onChange={handleSalaryChange}
                                className="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto"
                            />
                        </div>
                     </div>
                </AccordionSection>
            </div>

            <div id="birth-date">
                <AccordionSection title={t('section.birth_date')} icon={<CalendarDaysIcon className="w-5 h-5"/>} defaultOpen>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <FormSelect label={t('form.birth_year')} name="birthYear" value={formData.birthYear} onChange={handleInputChange}><option>1989</option></FormSelect>
                        <FormSelect label={t('form.birth_month')} name="birthMonth" value={formData.birthMonth} onChange={handleInputChange}><option>יוני</option></FormSelect>
                        <FormSelect label={t('form.birth_day')} name="birthDay" value={formData.birthDay} onChange={handleInputChange}><option>15</option></FormSelect>
                        <FormInput label={t('form.age')} name="age" value={formData.age} onChange={handleInputChange} />
                    </div>
                </AccordionSection>
            </div>
            
            <div id="languages">
                <AccordionSection title={t('section.languages')} icon={<LanguageIcon className="w-5 h-5"/>} defaultOpen>
                     <div className="space-y-4">
                        {formData.languages?.map((lang: any) => (
                            <div key={lang.id} className="flex items-center gap-4">
                                <div className="flex-grow">
                                    <SkillSlider label={lang.name} level={lang.level} levelText={lang.levelText} onChange={(level) => handleLanguageLevelChange(lang.id, level)} />
                                </div>
                                <button onClick={() => handleRemoveLanguage(lang.id)} className="p-2 text-text-subtle hover:text-red-500 rounded-full hover:bg-red-50">
                                    <TrashIcon className="w-5 h-5"/>
                                </button>
                            </div>
                        ))}
                        <div className="flex items-end gap-2 pt-4 border-t border-border-default">
                             <div className="flex-grow">
                                <label className="block text-sm font-semibold text-text-muted mb-1">{t('form.add_language')}</label>
                                <input type="text" placeholder="לדוגמה: ספרדית" value={newLanguageName} onChange={e => setNewLanguageName(e.target.value)} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"/>
                            </div>
                            <button onClick={handleAddLanguage} className="bg-primary-100 text-primary-700 font-semibold px-4 py-2.5 rounded-lg hover:bg-primary-200 transition shadow-sm flex-shrink-0">{t('form.add')}</button>
                        </div>
                     </div>
                </AccordionSection>
            </div>
            
            <div id="education">
                <AccordionSection title={t('section.education')} icon={<AcademicCapIcon className="w-5 h-5"/>} defaultOpen>
                     <div className="space-y-3">
                        {formData.education?.map((edu: any) => (
                            <div key={edu.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-bg-subtle/50 group">
                                {editingEducation?.id === edu.id ? (
                                    <input
                                        type="text"
                                        value={editingEducation.value}
                                        onChange={(e) => setEditingEducation({ ...editingEducation, value: e.target.value })}
                                        onBlur={handleUpdateEducation}
                                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateEducation()}
                                        autoFocus
                                        className="w-full bg-bg-input border border-primary-300 text-sm rounded-md p-1.5"
                                    />
                                ) : (
                                    <p className="text-sm text-text-muted font-semibold cursor-pointer" onClick={() => setEditingEducation(edu)}>
                                        {edu.value}
                                    </p>
                                )}
                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setEditingEducation(edu)} className="p-1.5 text-text-subtle hover:text-primary-600 rounded-full"><PencilIcon className="w-4 h-4"/></button>
                                    <button onClick={() => handleRemoveEducation(edu.id)} className="p-1.5 text-text-subtle hover:text-red-500 rounded-full"><TrashIcon className="w-4 h-4"/></button>
                                </div>
                            </div>
                        ))}
                        <div className="flex items-end gap-2 pt-4 border-t border-border-default">
                            <div className="flex-grow">
                                <label className="block text-sm font-semibold text-text-muted mb-1">{t('form.add_education')}</label>
                                <input type="text" value={newEducation} onChange={e => setNewEducation(e.target.value)} placeholder="לדוגמה: תואר שני במנהל עסקים, אוניברסיטת בן גוריון" className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5" />
                            </div>
                            <button onClick={handleAddEducation} className="bg-primary-100 text-primary-700 font-semibold px-4 py-2.5 rounded-lg hover:bg-primary-200 transition shadow-sm flex-shrink-0">{t('form.add')}</button>
                        </div>
                     </div>
                </AccordionSection>
            </div>

            <div id="skills">
                <AccordionSection title={t('section.skills')} icon={<TagIcon className="w-5 h-5"/>} defaultOpen>
                    <p className="font-semibold text-text-default mb-2">{t('form.soft_skills')}</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {formData.softSkills?.map((skill: string) => <Tag key={skill} onRemove={() => handleRemoveSoftSkill(skill)}>{skill}</Tag>)}
                    </div>
                     <div className="flex items-center gap-2">
                        <input type="text" placeholder="הוסף מיומנות רכה..." value={newSoftSkill} onChange={(e) => setNewSoftSkill(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSoftSkill()} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"/>
                        <button onClick={handleAddSoftSkill} className="bg-primary-100 text-primary-700 font-semibold px-4 py-2.5 rounded-lg hover:bg-primary-200 transition shadow-sm flex-shrink-0">{t('form.add')}</button>
                    </div>
                    
                     <hr className="my-6 border-border-default" />
                     <p className="font-semibold text-text-default mb-2">{t('form.tech_skills')}</p>
                    <div className="space-y-4">
                        {formData.techSkills?.map((skill: any) => (
                            <div key={skill.id} className="flex items-center gap-4">
                                <div className="flex-grow">
                                    <SkillSlider label={skill.name} level={skill.level} levelText={skill.levelText} onChange={(level) => handleTechSkillLevelChange(skill.id, level)} />
                                </div>
                                <button onClick={() => handleRemoveTechSkill(skill.id)} className="p-2 text-text-subtle hover:text-red-500 rounded-full hover:bg-red-50">
                                    <TrashIcon className="w-5 h-5"/>
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-end gap-2 pt-4 mt-4 border-t border-border-default">
                        <div className="flex-grow">
                            <label className="block text-sm font-semibold text-text-muted mb-1">{t('form.add_skill')}</label>
                            <input type="text" placeholder="לדוגמה: Figma" value={newTechSkill.name} onChange={e => setNewTechSkill(prev => ({ ...prev, name: e.target.value }))} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"/>
                        </div>
                        <button onClick={handleAddTechSkill} className="bg-primary-100 text-primary-700 font-semibold px-4 py-2.5 rounded-lg hover:bg-primary-200 transition shadow-sm flex-shrink-0">{t('form.add')}</button>
                    </div>
                </AccordionSection>
            </div>
            
            <div id="notes" className="space-y-6">
                {viewMode === 'recruiter' && formData.candidateNotes && (
                    <div id="candidate-notes-view">
                        <AccordionSection title={t('section.candidate_notes')} icon={<ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5"/>} defaultOpen>
                            <blockquote className="bg-bg-subtle p-3 border-r-4 border-primary-300 text-text-muted italic">
                               {formData.candidateNotes}
                            </blockquote>
                        </AccordionSection>
                    </div>
                )}

                {viewMode === 'recruiter' && (
                    <div id="recruiter-notes">
                        <AccordionSection title={t('section.recruiter_notes')} icon={<ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5"/>} defaultOpen>
                            <label htmlFor={recruiterNotesId} className="sr-only">{t('section.recruiter_notes')}</label>
                            <textarea 
                                id={recruiterNotesId}
                                name="recruiterNotes"
                                value={formData.recruiterNotes}
                                onChange={handleInputChange}
                                className="w-full h-24 bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                                placeholder={t('section.recruiter_notes_placeholder')}
                            ></textarea>
                        </AccordionSection>
                    </div>
                )}
            </div>

             {viewMode === 'candidate' && (
                <div id="candidate-notes-edit">
                    <AccordionSection title={t('section.candidate_notes')} icon={<ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5"/>} defaultOpen>
                        <label htmlFor={candidateNotesId} className="sr-only">{t('section.candidate_notes')}</label>
                        <textarea 
                            id={candidateNotesId}
                            name="candidateNotes"
                            value={formData.candidateNotes}
                            onChange={handleInputChange}
                            className="w-full h-24 bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                            placeholder={t('section.candidate_notes_placeholder')}
                        ></textarea>
                    </AccordionSection>
                </div>
            )}


            {viewMode === 'recruiter' && (
                <div className="flex justify-end space-x-3 pt-4">
                    <button className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition">{t('form.delete_candidate')}</button>
                    <button className="bg-primary-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-600 transition shadow-sm">{t('form.save')}</button>
                </div>
            )}
        </div>
    );
};

export default MainContent;
