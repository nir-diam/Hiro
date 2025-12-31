
import React, { useState } from 'react';
import { InformationCircleIcon, TrashIcon, ArrowUpTrayIcon, CheckCircleIcon, ArrowTopRightOnSquareIcon, EnvelopeIcon, LinkIcon, ChevronUpIcon, ChevronDownIcon, ChartBarIcon, TargetIcon } from './Icons'; // Added TargetIcon
import UsageSettingsTab from './UsageSettingsTab';
import CompanyTagsSettingsView from './CompanyTagsSettingsView';
import CustomFieldsSettingsView from './CustomFieldsSettingsView';
import JobHealthSettingsView from './JobHealthSettingsView';
import { useLanguage } from '../context/LanguageContext';


// Reusable components for this view
const TabButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; }> = ({ title, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`py-3 px-6 font-bold text-base transition-all duration-300 ease-in-out border-b-4 ${
            isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default'
        }`}
    >
        {title}
    </button>
);

const SettingsInput: React.FC<{ label: string; value: string; onChange?: (val: string) => void; type?: string }> = ({ label, value, onChange, type = "text" }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <input 
            type={type}
            value={value} 
            onChange={onChange ? (e) => onChange(e.target.value) : undefined}
            disabled={!onChange}
            className={`w-full border border-border-default text-text-default font-medium text-sm rounded-lg p-2.5 ${onChange ? 'bg-bg-input focus:ring-primary-500 focus:border-primary-500' : 'bg-bg-subtle/70'}`} 
        />
    </div>
);

const UsageMeter: React.FC<{ label: string; used: number; total: number; overQuotaLabel?: string }> = ({ label, used, total, overQuotaLabel = "חריגה" }) => {
    const percentage = total > 0 ? (used / total) * 100 : 0;
    const isOverQuota = percentage > 100;
    const barWidth = isOverQuota ? 100 : percentage;
    const barColor = isOverQuota ? 'bg-red-500' : 'bg-primary-500';

    return (
        <div className="bg-bg-subtle/70 p-4 rounded-lg border border-border-default">
            <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-text-default">{label}</span>
                <span className={`text-sm font-bold tabular-nums ${isOverQuota ? 'text-red-600' : 'text-text-muted'}`}>
                    {used.toLocaleString()} / {total.toLocaleString()}
                    {isOverQuota && <span className="text-xs font-semibold bg-red-100 text-red-700 py-0.5 px-1.5 rounded-full mr-2">{overQuotaLabel}</span>}
                </span>
            </div>
            <div className="w-full bg-border-default rounded-full h-2.5">
                <div className={`${barColor} h-2.5 rounded-full`} style={{ width: `${barWidth}%` }}></div>
            </div>
        </div>
    );
};

const QuotaCard: React.FC<{ title: string; items: { label: string; value: string | number }[] }> = ({ title, items }) => (
    <div className="bg-bg-subtle/70 p-4 rounded-lg border border-border-default">
        <h3 className="text-base font-bold text-text-default mb-3">{title}</h3>
        <div className="space-y-2">
            {items.map(item => (
                <div key={item.label} className="flex justify-between items-center text-sm">
                    <span className="text-text-muted">{item.label}:</span>
                    <span className="font-semibold text-text-default">{item.value.toLocaleString()}</span>
                </div>
            ))}
        </div>
    </div>
);

const renderField = (label: string, name: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void, type: 'input' | 'textarea' = 'input') => {
    const Component = type === 'input' ? 'input' : 'textarea';
    return (
         <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 items-start">
            <label htmlFor={name} className="font-semibold text-text-muted pt-2.5">{label}</label>
            <div className="relative">
                <Component 
                    id={name}
                    name={name} 
                    value={value} 
                    onChange={onChange}
                    rows={type === 'textarea' ? 3 : undefined}
                    className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                />
                <InformationCircleIcon className="w-5 h-5 text-text-subtle absolute left-3 top-3"/>
            </div>
        </div>
    );
};


const ParametersTab: React.FC = () => {
    const { t } = useLanguage();
    const [params, setParams] = useState({
        companyEmail: 'hr@humand.co.il',
        replyToEmail: '',
        ccEmails: '',
        filteredDomains: '',
        filteredPhones: '',
        websiteUrl: 'https://humand.co.il/',
        thankYouPageUrl: '',
        privacyPolicyUrl: '',
    });
    const [isSignatureOpen, setIsSignatureOpen] = useState(true);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setParams(prev => ({ ...prev, [name]: value }));
    };
    
    return (
        <div className="space-y-8 animate-fade-in">
            {/* Warning Banner */}
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-r-lg" role="alert">
                <p><strong>{t('company_settings.params_warning')}</strong></p>
            </div>

            {/* Logo Section */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 items-center">
                <label className="font-semibold text-text-muted">{t('company_settings.logo')}</label>
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="w-48 h-20 bg-bg-card border border-border-default rounded-md flex items-center justify-center p-2 shadow-sm">
                        {/* Placeholder for the logo */}
                        <img src="https://hiro.co.il/wp-content/uploads/2021/11/logo-2.svg" alt="מימד אנושי לוגו" className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="flex items-center gap-4">
                         <button className="flex items-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm">
                            <ArrowUpTrayIcon className="w-5 h-5"/>
                            <span>{t('company_settings.upload_logo')}</span>
                        </button>
                        <button className="p-2 text-text-subtle hover:text-red-600"><TrashIcon className="w-5 h-5"/></button>
                    </div>
                    <a href="#" className="flex items-center gap-1 text-sm text-primary-600 hover:underline">
                        <InformationCircleIcon className="w-4 h-4"/>
                        <span>{t('company_settings.compress_link')}</span>
                    </a>
                </div>
            </div>
            
            {/* Email Section */}
            <div className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 items-center">
                    <label className="font-semibold text-text-muted">{t('company_settings.company_email')} <span className="text-red-500">*</span></label>
                    <div className="relative">
                        <input type="email" name="companyEmail" value={params.companyEmail} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"/>
                        <InformationCircleIcon className="w-5 h-5 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2"/>
                    </div>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 items-center">
                    <div></div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <span className="flex items-center gap-1.5 font-medium text-green-600"><CheckCircleIcon className="w-5 h-5"/> {t('company_settings.email_verify')}</span>
                        <span className="flex items-center gap-1.5 font-medium text-green-600"><CheckCircleIcon className="w-5 h-5"/> {t('company_settings.domain_verify')}</span>
                        <span className="flex items-center gap-1.5 font-medium text-green-600"><CheckCircleIcon className="w-5 h-5"/> {t('company_settings.mail_from_verify')}</span>
                        <span className="flex items-center gap-1.5 font-medium text-green-600"><CheckCircleIcon className="w-5 h-5"/> {t('company_settings.spf_verify')}</span>
                        <span className="flex items-center gap-1.5 font-medium text-green-600"><CheckCircleIcon className="w-5 h-5"/> {t('company_settings.dmarc_verify')}</span>
                        <a href="#" className="flex items-center gap-1 text-primary-600 hover:underline"><ArrowTopRightOnSquareIcon className="w-4 h-4"/> {t('company_settings.more_info')}</a>
                    </div>
                 </div>
            </div>

            {/* Other Fields Section */}
            <div className="space-y-4">
                {renderField(t('company_settings.reply_to'), 'replyToEmail', params.replyToEmail, handleChange)}
                {renderField(t('company_settings.cc_emails'), 'ccEmails', params.ccEmails, handleChange, 'textarea')}
                {renderField(t('company_settings.filtered_domains'), 'filteredDomains', params.filteredDomains, handleChange, 'textarea')}
                {renderField(t('company_settings.filtered_phones'), 'filteredPhones', params.filteredPhones, handleChange, 'textarea')}
                {renderField(t('company_settings.website_url'), 'websiteUrl', params.websiteUrl, handleChange, 'input')}
                {renderField(t('company_settings.thank_you_url'), 'thankYouPageUrl', params.thankYouPageUrl, handleChange, 'input')}
                {renderField(t('company_settings.privacy_url'), 'privacyPolicyUrl', params.privacyPolicyUrl, handleChange, 'input')}
            </div>

             {/* New Email Signature Section */}
            <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default">
                <button
                    onClick={() => setIsSignatureOpen(!isSignatureOpen)}
                    className="w-full flex items-center justify-between p-4 text-lg font-bold text-text-default"
                >
                    <div className="flex items-center gap-3">
                        <EnvelopeIcon className="w-5 h-5 text-primary-500" />
                        <span>{t('company_settings.email_signature')}</span>
                    </div>
                    {isSignatureOpen ? <ChevronUpIcon className="w-6 h-6 text-text-muted" /> : <ChevronDownIcon className="w-6 h-6 text-text-muted" />}
                </button>
                {isSignatureOpen && (
                    <div className="border-t border-border-default p-4 md:p-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                             <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('company_settings.signature_param')}</label>
                                <select className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm">
                                    <option>{t('company_settings.signature_executor')}</option>
                                    <option>{t('company_settings.signature_assigned')}</option>
                                    <option>{t('company_settings.signature_company')}</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2 pb-2.5">
                                <label className="text-sm font-semibold text-text-muted">{t('company_settings.signature_label')}</label>
                                <InformationCircleIcon className="w-5 h-5 text-text-subtle"/>
                            </div>
                        </div>

                        <div className="border border-border-default rounded-lg overflow-hidden">
                            <div className="flex items-center gap-1 p-2 bg-bg-subtle border-b border-border-default text-text-muted">
                                <select className="text-sm bg-transparent border-0 focus:ring-0 rounded-md py-1">
                                    <option>גופן</option>
                                    <option>Arial</option>
                                    <option>Heebo</option>
                                </select>
                                <select className="text-sm bg-transparent border-0 focus:ring-0 rounded-md py-1 w-16">
                                    <option>12</option>
                                    <option>14</option>
                                    <option>16</option>
                                </select>
                                <div className="w-px h-5 bg-border-default mx-1"></div>
                                <button className="p-2 hover:bg-bg-hover rounded-md font-bold">B</button>
                                <button className="p-2 hover:bg-bg-hover rounded-md font-bold italic">I</button>
                                <button className="p-2 hover:bg-bg-hover rounded-md font-bold underline">U</button>
                                <div className="w-px h-5 bg-border-default mx-1"></div>
                                <button className="p-2 hover:bg-bg-hover rounded-md"><LinkIcon className="w-5 h-5" /></button>
                            </div>
                            <div className="p-4 min-h-[200px] bg-bg-input">
                                <img src="https://hiro.co.il/wp-content/uploads/2021/11/logo-2.svg" alt="מימד אנושי לוגו" className="max-w-full max-h-full object-contain h-24" />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-text-muted">
                            <InformationCircleIcon className="w-5 h-5" />
                            <a href="#" className="hover:underline">{t('company_settings.test_email')}</a>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="flex justify-end pt-6 border-t border-border-default">
                <button className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 transition shadow-md">{t('company_settings.save_changes')}</button>
            </div>
        </div>
    );
}


const CompanySettingsView: React.FC = () => {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<'details' | 'parameters' | 'quota' | 'usage' | 'tags' | 'custom_fields' | 'health'>('usage');
    const [monthlyGoal, setMonthlyGoal] = useState('20');

    const renderContent = () => {
        switch (activeTab) {
            case 'details':
                return (
                    <div className="space-y-6 animate-fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <SettingsInput label={t('company_settings.field_company_name')} value="מימד אנושי" />
                            <SettingsInput label={t('company_settings.field_display_name')} value="מימד אנושי" />
                            <SettingsInput label={t('company_settings.field_creation_date')} value="12/05/2022" />
                            <SettingsInput label={t('company_settings.field_sms_source')} value="humand" />
                            <SettingsInput label={t('company_settings.field_ips')} value="" />
                            <SettingsInput label={t('company_settings.field_verified_phones')} value="0527372555" />
                        </div>
                        
                        {/* Goals Section */}
                        <div className="bg-bg-subtle/50 p-5 rounded-xl border border-border-default mt-6">
                            <div className="flex items-center gap-2 mb-4 text-primary-700">
                                <TargetIcon className="w-6 h-6" />
                                <h3 className="text-lg font-bold">{t('company_settings.goals_title')}</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <SettingsInput 
                                    label={t('company_settings.monthly_goal')}
                                    value={monthlyGoal} 
                                    onChange={setMonthlyGoal} 
                                    type="number"
                                />
                            </div>
                            <p className="text-xs text-text-muted mt-2">
                                {t('company_settings.goals_desc')}
                            </p>
                        </div>
                    </div>
                );
            case 'quota':
                return (
                     <div className="space-y-6 animate-fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <UsageMeter label={t('company_settings.quota_cv')} used={237985} total={150000} />
                            <UsageMeter label={t('company_settings.quota_tags')} used={76} total={200} />
                            <UsageMeter label={t('company_settings.quota_jobs')} used={164} total={200} />
                            <UsageMeter label={t('company_settings.quota_coordinators')} used={8} total={9} />
                            <UsageMeter label={t('company_settings.quota_contacts')} used={1} total={5} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                             <QuotaCard title={t('company_settings.quota_sms')} items={[
                                { label: t('company_settings.quota_backup'), value: 0 },
                                { label: t('company_settings.quota_monthly'), value: 0 },
                                { label: t('company_settings.quota_current'), value: 0 },
                            ]} />
                            <QuotaCard title={t('company_settings.quota_questionnaires')} items={[
                                { label: t('company_settings.quota_backup'), value: 0 },
                                { label: t('company_settings.quota_monthly'), value: 0 },
                                { label: t('company_settings.quota_current'), value: 0 },
                            ]} />
                            <QuotaCard title={t('company_settings.quota_emails')} items={[
                                { label: t('company_settings.quota_backup'), value: 0 },
                                { label: t('company_settings.quota_monthly'), value: 10000 },
                                { label: t('company_settings.quota_current'), value: 9899 },
                            ]} />
                             <QuotaCard title={t('company_settings.quota_ai')} items={[
                                { label: t('company_settings.quota_ai_monthly'), value: 710 },
                                { label: t('company_settings.quota_ai_remaining'), value: 709 },
                            ]} />
                        </div>
                    </div>
                );
            case 'parameters':
                 return <ParametersTab />;
            case 'usage':
                return <UsageSettingsTab />;
            case 'tags':
                return <CompanyTagsSettingsView />;
            case 'custom_fields':
                return <CustomFieldsSettingsView />;
            case 'health':
                return <JobHealthSettingsView />;
            default:
                return null;
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fadeIn 0.3s ease-out; }`}</style>
            <header className="flex-shrink-0 mb-6">
                <h1 className="text-2xl font-bold text-text-default mb-4">{t('company_settings.title')}</h1>
                <div className="border-b border-border-default overflow-x-auto">
                    <nav className="flex items-center -mb-px min-w-max gap-2">
                        <TabButton title={t('company_settings.tab_details')} isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} />
                        <TabButton title={t('company_settings.tab_quota')} isActive={activeTab === 'quota'} onClick={() => setActiveTab('quota')} />
                        <TabButton title={t('company_settings.tab_params')} isActive={activeTab === 'parameters'} onClick={() => setActiveTab('parameters')} />
                        <TabButton title={t('company_settings.tab_usage')} isActive={activeTab === 'usage'} onClick={() => setActiveTab('usage')} />
                        <TabButton title={t('company_settings.tab_tags')} isActive={activeTab === 'tags'} onClick={() => setActiveTab('tags')} />
                        <TabButton title={t('company_settings.tab_custom_fields')} isActive={activeTab === 'custom_fields'} onClick={() => setActiveTab('custom_fields')} />
                        <TabButton title={t('company_settings.tab_health')} isActive={activeTab === 'health'} onClick={() => setActiveTab('health')} />
                    </nav>
                </div>
            </header>
            <main className="flex-1 overflow-y-auto">
                {renderContent()}
            </main>
             {activeTab === 'details' && (
                 <div className="flex justify-end pt-6 border-t border-border-default">
                    <button className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 transition shadow-md">{t('company_settings.save_changes')}</button>
                </div>
             )}
        </div>
    );
};

export default CompanySettingsView;
