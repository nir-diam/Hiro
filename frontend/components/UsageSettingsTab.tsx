
import React, { useState } from 'react';
import { InformationCircleIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';

// Reusable local components
const FormSelect: React.FC<{ value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; name: string; children: React.ReactNode; }> = ({ value, onChange, name, children }) => (
    <select name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm">
        {children}
    </select>
);

const FormInput: React.FC<{ value: string | number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; name: string; type?: string; }> = ({ value, onChange, name, type = 'text' }) => (
    <input type={type} name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm" />
);

const SettingRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="grid grid-cols-[auto_1fr] md:grid-cols-2 items-center gap-4 py-3 border-b border-border-default last:border-b-0">
        <label className="text-sm font-semibold text-text-default flex items-center gap-2">
            <InformationCircleIcon className="w-5 h-5 text-text-subtle flex-shrink-0" />
            <span>{label}</span>
        </label>
        <div className="w-full max-w-[200px] justify-self-end">{children}</div>
    </div>
);

const CheckboxRow: React.FC<{ label: string; name: string; checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; isSub?: boolean }> = ({ label, name, checked, onChange, isSub = false }) => (
    <div className={`flex items-center justify-between py-3 border-b border-border-default last:border-b-0 ${isSub ? 'pr-8' : ''}`}>
        <label htmlFor={name} className="text-sm font-semibold text-text-default flex items-center gap-2 cursor-pointer">
            {!isSub && <InformationCircleIcon className="w-5 h-5 text-text-subtle flex-shrink-0" />}
            <span>{label}</span>
        </label>
        <input 
            type="checkbox" 
            id={name}
            name={name} 
            checked={checked} 
            onChange={onChange} 
            className="w-5 h-5 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500 cursor-pointer"
        />
    </div>
);

const initialSettings = {
    interfaceLanguage: 'עברית',
    doubleAuth: 'לא פעיל',
    googleLogin: 'פעיל',
    foreignPhones: 'לא נתמך',
    initialScreeningLevel: 'טלפוני',
    sendMethod: 'דוא"ל',
    sendFromFix: 'כן',
    hideDetails: 'לא',
    cvInHebrew: 'לא',
    jobCities: 'כלום לא מסומן',
    jobValidityDays: 60,
    jobTypeValidityDays: 180,
    returnMonths: 3,
    questionnaireSource: 'חברה',
    systemReferral: 'מערכת',
    autoDisconnect: false,
    logoOnCv: true,
    sendOnlyOriginalCv: true,
    candidateNoLocationToFix: true,
    candidateNoTagToFix: true,
    showCvPreview: true,
    importHunterCandidates: false,
    jobAlerts: false,
    downloadCvInDashboard: true,
    autoThanksEmail: false,
    oneCandidatePerEmail: false,
    billingStatusParent: false,
    billingStatusAccepted: false,
};

const UsageSettingsTab: React.FC = () => {
    const { t } = useLanguage();
    const [settings, setSettings] = useState(initialSettings);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        setSettings(prev => ({
            ...prev,
            [name]: checked !== undefined ? checked : value
        }));
    };

    return (
        <div className="animate-fade-in">
            <h2 className="text-xl font-bold text-text-default mb-6">{t('company_settings.tab_usage')}</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
                {/* Left Column from image */}
                <div className="bg-bg-card p-4 rounded-lg border border-border-default">
                    <h3 className="text-base font-bold mb-2">{t('company_settings.interface_settings')}</h3>
                    <div>
                        <SettingRow label={t('company_settings.interface_lang')}><FormSelect name="interfaceLanguage" value={settings.interfaceLanguage} onChange={handleChange}><option>עברית</option><option>English</option></FormSelect></SettingRow>
                        <SettingRow label={t('company_settings.double_auth')}><FormSelect name="doubleAuth" value={settings.doubleAuth} onChange={handleChange}><option>לא פעיל</option><option>פעיל</option></FormSelect></SettingRow>
                        <SettingRow label={t('company_settings.google_login')}><FormSelect name="googleLogin" value={settings.googleLogin} onChange={handleChange}><option>פעיל</option><option>לא פעיל</option></FormSelect></SettingRow>
                        <SettingRow label={t('company_settings.foreign_phones')}><FormSelect name="foreignPhones" value={settings.foreignPhones} onChange={handleChange}><option>לא נתמך</option><option>נתמך</option></FormSelect></SettingRow>
                        <SettingRow label={t('company_settings.initial_screening')}><FormSelect name="initialScreeningLevel" value={settings.initialScreeningLevel} onChange={handleChange}><option>טלפוני</option><option>פרונטלי</option></FormSelect></SettingRow>
                        <SettingRow label={t('company_settings.send_method')}><FormSelect name="sendMethod" value={settings.sendMethod} onChange={handleChange}><option>{'דוא"ל'}</option><option>SMS</option></FormSelect></SettingRow>
                        <SettingRow label={t('company_settings.send_from_fix')}><FormSelect name="sendFromFix" value={settings.sendFromFix} onChange={handleChange}><option>כן</option><option>לא</option></FormSelect></SettingRow>
                        <SettingRow label={t('company_settings.hide_details')}><FormSelect name="hideDetails" value={settings.hideDetails} onChange={handleChange}><option>לא</option><option>כן</option></FormSelect></SettingRow>
                        <SettingRow label={t('company_settings.cv_hebrew')}><FormSelect name="cvInHebrew" value={settings.cvInHebrew} onChange={handleChange}><option>לא</option><option>כן</option></FormSelect></SettingRow>
                        <SettingRow label={t('company_settings.job_cities')}><FormSelect name="jobCities" value={settings.jobCities} onChange={handleChange}><option>כלום לא מסומן</option></FormSelect></SettingRow>
                        <SettingRow label={t('company_settings.job_validity')}><FormInput name="jobValidityDays" value={settings.jobValidityDays} onChange={handleChange} type="number" /></SettingRow>
                        <SettingRow label={t('company_settings.job_type_validity')}><FormInput name="jobTypeValidityDays" value={settings.jobTypeValidityDays} onChange={handleChange} type="number" /></SettingRow>
                        <SettingRow label={t('company_settings.return_months')}><FormInput name="returnMonths" value={settings.returnMonths} onChange={handleChange} type="number" /></SettingRow>
                        <SettingRow label={t('company_settings.questionnaire_source')}><FormSelect name="questionnaireSource" value={settings.questionnaireSource} onChange={handleChange}><option>חברה</option></FormSelect></SettingRow>
                        <SettingRow label={t('company_settings.system_referral')}><FormSelect name="systemReferral" value={settings.systemReferral} onChange={handleChange}><option>מערכת</option></FormSelect></SettingRow>
                    </div>
                </div>

                {/* Right Column from image (checkboxes) */}
                <div className="bg-bg-card p-4 rounded-lg border border-border-default">
                    <h3 className="text-base font-bold mb-2">{t('company_settings.additional_settings')}</h3>
                    <div>
                        <CheckboxRow label={t('company_settings.auto_disconnect')} name="autoDisconnect" checked={settings.autoDisconnect} onChange={handleChange} />
                        <CheckboxRow label={t('company_settings.logo_on_cv')} name="logoOnCv" checked={settings.logoOnCv} onChange={handleChange} />
                        <CheckboxRow label={t('company_settings.original_cv_only')} name="sendOnlyOriginalCv" checked={settings.sendOnlyOriginalCv} onChange={handleChange} />
                        <CheckboxRow label={t('company_settings.no_location_fix')} name="candidateNoLocationToFix" checked={settings.candidateNoLocationToFix} onChange={handleChange} />
                        <CheckboxRow label={t('company_settings.no_tag_fix')} name="candidateNoTagToFix" checked={settings.candidateNoTagToFix} onChange={handleChange} />
                        <CheckboxRow label={t('company_settings.cv_preview')} name="showCvPreview" checked={settings.showCvPreview} onChange={handleChange} />
                        <CheckboxRow label={t('company_settings.import_hunter')} name="importHunterCandidates" checked={settings.importHunterCandidates} onChange={handleChange} />
                        <CheckboxRow label={t('company_settings.job_alerts')} name="jobAlerts" checked={settings.jobAlerts} onChange={handleChange} />
                        <CheckboxRow label={t('company_settings.download_cv_dashboard')} name="downloadCvInDashboard" checked={settings.downloadCvInDashboard} onChange={handleChange} />
                        <CheckboxRow label={t('company_settings.auto_thanks')} name="autoThanksEmail" checked={settings.autoThanksEmail} onChange={handleChange} />
                        <CheckboxRow label={t('company_settings.one_candidate_email')} name="oneCandidatePerEmail" checked={settings.oneCandidatePerEmail} onChange={handleChange} />
                         <div>
                             <CheckboxRow label={t('company_settings.billing_statuses')} name="billingStatusParent" checked={settings.billingStatusParent} onChange={handleChange} />
                             <CheckboxRow label={t('company_settings.billing_accepted')} name="billingStatusAccepted" checked={settings.billingStatusAccepted} onChange={handleChange} isSub />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-6 mt-6 border-t border-border-default">
                <button className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 transition shadow-md">{t('company_settings.save_changes')}</button>
            </div>
        </div>
    );
};

export default UsageSettingsTab;
