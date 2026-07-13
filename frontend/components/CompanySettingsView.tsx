
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { InformationCircleIcon, TrashIcon, ArrowUpTrayIcon, CheckCircleIcon, ArrowTopRightOnSquareIcon, EnvelopeIcon, LinkIcon, ChevronUpIcon, ChevronDownIcon, ChartBarIcon, TargetIcon, BanknotesIcon, SparklesIcon, TagIcon, ArrowPathIcon, BuildingOffice2Icon } from './Icons';
import SearchableSelect from './SearchableSelect';
import UsageSettingsTab from './UsageSettingsTab';
import CompanyTagsSettingsView from './CompanyTagsSettingsView';
import CustomFieldsSettingsView from './CustomFieldsSettingsView';
import JobHealthSettingsView from './JobHealthSettingsView';
import ClientHealthSettingsView from './ClientHealthSettingsView'; // New Import
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { fetchClientMatchingEngineConfigs, type ClientMatchingEnginePresetDto } from '../services/matchingEngineClientApi';
import { fetchClientUsageSettings, saveClientUsageSettings } from '../services/usageSettingsApi';
import {
    fetchPosthogAnalytics,
    savePosthogAnalytics,
  DEFAULT_POSTHOG_HOST,
  POSTHOG_HOST_OPTIONS,
  fetchLandingContact,
  saveLandingContact,
  type PosthogAnalyticsConfig,
  type LandingContact,
} from '../services/publishingApi';
import {
  fetchClientBranding,
  saveClientBranding,
  uploadClientLogo,
  type ClientBranding,
} from '../services/clientBrandingApi';
import { authHeaders } from '../utils/authHeaders';

const API_BASE = import.meta.env.VITE_API_BASE || '';

type ClientOption = { id: string; name: string; displayName?: string };

type ClientDetailsRow = {
  id: string;
  name: string;
  displayName?: string | null;
  domain?: string | null;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

function buildMatchingEngineAuthHeaders(): HeadersInit {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: HeadersInit = { Accept: 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    return h;
}

/** Same mini bar as `AdminMatchingEngineView` preset cards */
function PresetMainWeightsMiniBar({ config }: { config: Record<string, unknown> | undefined }) {
    const mw = config?.mainWeights as Record<string, number> | undefined;
    if (!mw) return null;
    const keys = [
        { id: 'vector', color: 'bg-purple-400', label: 'V' },
        { id: 'tags', color: 'bg-blue-400', label: 'T' },
        { id: 'geo', color: 'bg-emerald-400', label: 'G' },
        { id: 'experience', color: 'bg-orange-400', label: 'E' },
        { id: 'intent', color: 'bg-rose-400', label: 'I' },
    ];
    const total = keys.reduce((s, k) => s + (mw[k.id] ?? 0), 0) || 1;
    return (
        <div className="w-full mt-1 mb-2">
            <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 w-full gap-px">
                {keys.map((k) => {
                    const pct = ((mw[k.id] ?? 0) / total) * 100;
                    if (pct === 0) return null;
                    return (
                        <div
                            key={k.id}
                            className={`${k.color} h-full`}
                            style={{ width: `${pct}%` }}
                            title={`${k.label}: ${mw[k.id]}%`}
                        />
                    );
                })}
            </div>
        </div>
    );
}

// Reusable components for this view
const TabButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; icon?: React.ReactNode }> = ({ title, isActive, onClick, icon }) => (
    <button
        onClick={onClick}
        className={`py-3 px-6 font-bold text-base transition-all duration-300 ease-in-out border-b-4 flex items-center gap-2 ${
            isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default'
        }`}
    >
        {icon}
        {title}
    </button>
);

const SettingsInput: React.FC<{ label: string; value: string; onChange?: (val: string) => void; type?: string; placeholder?: string; subLabel?: string }> = ({ label, value, onChange, type = "text", placeholder, subLabel }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">
            {label}
            {subLabel && <span className="text-xs font-normal text-text-subtle mr-2">({subLabel})</span>}
        </label>
        <input 
            type={type}
            value={value} 
            onChange={onChange ? (e) => onChange(e.target.value) : undefined}
            disabled={!onChange}
            placeholder={placeholder}
            className={`w-full border border-border-default text-text-default font-medium text-sm rounded-lg p-2.5 ${onChange ? 'bg-bg-input focus:ring-primary-500 focus:border-primary-500' : 'bg-bg-subtle/70'}`} 
        />
    </div>
);

const FormSelect: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode }> = ({ label, value, onChange, children }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <select value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm">
            {children}
        </select>
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

const ClientBrandingSection: React.FC<{ clientId: string | null }> = ({ clientId }) => {
    const { t } = useLanguage();
    const [branding, setBranding] = useState<ClientBranding>({ logoUrl: null, primaryColor: '#1e293b' });
    const [savedBranding, setSavedBranding] = useState<ClientBranding>({ logoUrl: null, primaryColor: '#1e293b' });
    const [brandingLoading, setBrandingLoading] = useState(false);
    const [brandingLoadError, setBrandingLoadError] = useState<string | null>(null);
    const [brandingSaveError, setBrandingSaveError] = useState<string | null>(null);
    const [isSavingBranding, setIsSavingBranding] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [brandingSaveSuccess, setBrandingSaveSuccess] = useState(false);
    const logoInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!clientId) {
            setBranding({ logoUrl: null, primaryColor: '#1e293b' });
            setSavedBranding({ logoUrl: null, primaryColor: '#1e293b' });
            return;
        }
        let cancelled = false;
        setBrandingLoading(true);
        setBrandingLoadError(null);
        fetchClientBranding(clientId)
            .then((data) => {
                if (cancelled) return;
                const normalized = {
                    logoUrl: data.logoUrl,
                    primaryColor: data.primaryColor || '#1e293b',
                };
                setBranding(normalized);
                setSavedBranding(normalized);
            })
            .catch((e: Error) => {
                if (!cancelled) setBrandingLoadError(e.message || 'טעינת מיתוג נכשלה');
            })
            .finally(() => {
                if (!cancelled) setBrandingLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [clientId]);

    const normalizeBrandColor = (color: string) =>
        (color.trim().toLowerCase() || '#1e293b');

    const brandingDirty =
        (branding.logoUrl || null) !== (savedBranding.logoUrl || null) ||
        normalizeBrandColor(branding.primaryColor) !== normalizeBrandColor(savedBranding.primaryColor);

    const handleSaveBranding = async () => {
        if (!clientId) return;
        setBrandingSaveError(null);
        setBrandingSaveSuccess(false);
        setIsSavingBranding(true);
        try {
            const saved = await saveClientBranding(clientId, {
                logoUrl: branding.logoUrl,
                primaryColor: branding.primaryColor.trim() || '#1e293b',
            });
            const normalized = {
                logoUrl: saved.logoUrl,
                primaryColor: saved.primaryColor || '#1e293b',
            };
            setBranding(normalized);
            setSavedBranding(normalized);
            setBrandingSaveSuccess(true);
            setTimeout(() => setBrandingSaveSuccess(false), 2500);
        } catch (e: unknown) {
            setBrandingSaveError(e instanceof Error ? e.message : 'שמירת מיתוג נכשלה');
        } finally {
            setIsSavingBranding(false);
        }
    };

    const handleLogoFile = async (file: File) => {
        if (!clientId) return;
        setBrandingSaveError(null);
        setBrandingSaveSuccess(false);
        setIsUploadingLogo(true);
        try {
            const publicUrl = await uploadClientLogo(clientId, file);
            setBranding((prev) => ({ ...prev, logoUrl: publicUrl }));
        } catch (e: unknown) {
            setBrandingSaveError(e instanceof Error ? e.message : 'העלאת לוגו נכשלה');
        } finally {
            setIsUploadingLogo(false);
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-4 md:p-6 space-y-4">
            <div>
                <h3 className="text-lg font-bold text-text-default">לוגו וצבע מותג</h3>
                <p className="text-sm text-text-muted mt-1">
                    משמש בדפי נחיתה, מודעות Nano Banana ופרסום משרות.
                </p>
            </div>
            {!clientId ? (
                <p className="text-sm text-text-muted">{t('company_settings.usage_no_client')}</p>
            ) : brandingLoading ? (
                <p className="text-sm text-text-muted">טוען...</p>
            ) : (
                <>
                    {brandingLoadError && <p className="text-sm text-red-600">{brandingLoadError}</p>}
                    {brandingSaveError && <p className="text-sm text-red-600">{brandingSaveError}</p>}
                    {brandingSaveSuccess && (
                        <p className="text-sm text-green-600 font-medium">המיתוג נשמר בהצלחה</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 items-center">
                        <label className="font-semibold text-text-muted">{t('company_settings.logo')}</label>
                        <div className="flex items-center gap-4 flex-wrap">
                            <div className="w-48 h-20 bg-bg-card border border-border-default rounded-md flex items-center justify-center p-2 shadow-sm">
                                {branding.logoUrl ? (
                                    <img
                                        src={branding.logoUrl}
                                        alt="לוגו החברה"
                                        className="max-w-full max-h-full object-contain"
                                    />
                                ) : (
                                    <span className="text-xs text-text-muted">אין לוגו</span>
                                )}
                            </div>
                            <div className="flex items-center gap-4">
                                <input
                                    ref={logoInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) void handleLogoFile(file);
                                        e.target.value = '';
                                    }}
                                />
                                <button
                                    type="button"
                                    disabled={isUploadingLogo || isSavingBranding}
                                    onClick={() => logoInputRef.current?.click()}
                                    className="flex items-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm disabled:opacity-60"
                                >
                                    <ArrowUpTrayIcon className="w-5 h-5" />
                                    <span>{isUploadingLogo ? 'מעלה...' : t('company_settings.upload_logo')}</span>
                                </button>
                                {branding.logoUrl && (
                                    <button
                                        type="button"
                                        onClick={() => setBranding((prev) => ({ ...prev, logoUrl: null }))}
                                        disabled={isUploadingLogo || isSavingBranding}
                                        className="p-2 text-text-subtle hover:text-red-600 disabled:opacity-60"
                                        title="הסר לוגו"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 items-center">
                        <label className="font-semibold text-text-muted">צבע מותג ראשי</label>
                        <div className="flex items-center gap-3 flex-wrap">
                            <input
                                type="color"
                                value={/^#[0-9a-fA-F]{6}$/.test(branding.primaryColor) ? branding.primaryColor : '#1e293b'}
                                onChange={(e) => setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))}
                                className="w-12 h-10 rounded border border-border-default cursor-pointer"
                            />
                            <input
                                type="text"
                                value={branding.primaryColor}
                                onChange={(e) => setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))}
                                placeholder="#1e293b"
                                className="w-32 bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 font-mono dir-ltr"
                                dir="ltr"
                            />
                            <div
                                className="h-10 flex-1 min-w-[120px] rounded-lg border border-border-default"
                                style={{ backgroundColor: branding.primaryColor || '#1e293b' }}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        {brandingDirty && !isSavingBranding && !isUploadingLogo && (
                            <p className="text-xs text-text-muted">יש שינויים שלא נשמרו</p>
                        )}
                        <button
                            type="button"
                            onClick={() => void handleSaveBranding()}
                            className="bg-primary-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-primary-700 transition shadow-md disabled:opacity-50"
                        >
                            {isSavingBranding ? 'שומר...' : 'שמור לוגו וצבע'}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

const ParametersTab: React.FC<{ clientId: string | null }> = ({ clientId }) => {
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
    const [landingContact, setLandingContact] = useState<LandingContact>({
        contactEmail: '',
        contactPhone1: '',
        contactPhone2: '',
    });
    const [savedLandingContact, setSavedLandingContact] = useState<LandingContact>({
        contactEmail: '',
        contactPhone1: '',
        contactPhone2: '',
    });
    const [landingContactLoading, setLandingContactLoading] = useState(false);
    const [landingContactLoadError, setLandingContactLoadError] = useState<string | null>(null);
    const [landingContactSaveError, setLandingContactSaveError] = useState<string | null>(null);
    const [isSavingLandingContact, setIsSavingLandingContact] = useState(false);
    const [landingContactSaveSuccess, setLandingContactSaveSuccess] = useState(false);
    const [isSignatureOpen, setIsSignatureOpen] = useState(true);

    useEffect(() => {
        if (!clientId) {
            setLandingContact({ contactEmail: '', contactPhone1: '', contactPhone2: '' });
            setSavedLandingContact({ contactEmail: '', contactPhone1: '', contactPhone2: '' });
            return;
        }
        let cancelled = false;
        setLandingContactLoading(true);
        setLandingContactLoadError(null);
        fetchLandingContact(clientId)
            .then((data) => {
                if (cancelled) return;
                setLandingContact(data);
                setSavedLandingContact(data);
            })
            .catch((e: Error) => {
                if (!cancelled) setLandingContactLoadError(e.message || 'טעינה נכשלה');
            })
            .finally(() => {
                if (!cancelled) setLandingContactLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [clientId]);

    const landingContactDirty =
        landingContact.contactEmail.trim() !== savedLandingContact.contactEmail.trim() ||
        landingContact.contactPhone1.trim() !== savedLandingContact.contactPhone1.trim() ||
        landingContact.contactPhone2.trim() !== savedLandingContact.contactPhone2.trim();

    const handleSaveLandingContact = async () => {
        if (!clientId) return;
        setLandingContactSaveError(null);
        setLandingContactSaveSuccess(false);
        setIsSavingLandingContact(true);
        try {
            const saved = await saveLandingContact({
                contactEmail: landingContact.contactEmail.trim(),
                contactPhone1: landingContact.contactPhone1.trim(),
                contactPhone2: landingContact.contactPhone2.trim(),
            }, clientId);
            setLandingContact(saved);
            setSavedLandingContact(saved);
            setLandingContactSaveSuccess(true);
            setTimeout(() => setLandingContactSaveSuccess(false), 2500);
        } catch (e: unknown) {
            setLandingContactSaveError(e instanceof Error ? e.message : 'שמירה נכשלה');
        } finally {
            setIsSavingLandingContact(false);
        }
    };

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

            {/* Landing page contact — shown on job landing pages */}
            <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-4 md:p-6 space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-text-default">פרטי קשר לדפי נחיתה</h3>
                    <p className="text-sm text-text-muted mt-1">
                        אימייל וטלפונים שמוצגים בעמודי פרסום משרות (מקטע &quot;יצירת קשר&quot;).
                    </p>
                </div>
                {!clientId ? (
                    <p className="text-sm text-text-muted">{t('company_settings.usage_no_client')}</p>
                ) : landingContactLoading ? (
                    <p className="text-sm text-text-muted">טוען...</p>
                ) : (
                    <>
                        {landingContactLoadError && (
                            <p className="text-sm text-red-600">{landingContactLoadError}</p>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <SettingsInput
                                    label="אימייל"
                                    type="email"
                                    value={landingContact.contactEmail}
                                    onChange={(v) => setLandingContact((prev) => ({ ...prev, contactEmail: v }))}
                                />
                            </div>
                            <SettingsInput
                                label="טלפון 1"
                                type="tel"
                                value={landingContact.contactPhone1}
                                onChange={(v) => setLandingContact((prev) => ({ ...prev, contactPhone1: v }))}
                            />
                            <SettingsInput
                                label="טלפון 2"
                                type="tel"
                                value={landingContact.contactPhone2}
                                onChange={(v) => setLandingContact((prev) => ({ ...prev, contactPhone2: v }))}
                            />
                        </div>
                        {landingContactSaveError && (
                            <p className="text-sm text-red-600">{landingContactSaveError}</p>
                        )}
                        {landingContactSaveSuccess && (
                            <p className="text-sm text-green-600 font-medium">נשמר בהצלחה</p>
                        )}
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={handleSaveLandingContact}
                                disabled={!landingContactDirty || isSavingLandingContact}
                                className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSavingLandingContact ? 'שומר...' : 'שמור פרטי קשר'}
                            </button>
                        </div>
                    </>
                )}
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
                                <span className="text-sm text-text-muted">לוגו החברה יוצג כאן (מוגדר בלשונית פרטים אישיים)</span>
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

const FinanceDefaultsTab: React.FC = () => {
    const { t } = useLanguage();
    const [financeSettings, setFinanceSettings] = useState({
        defaultCommissionType: 'percent', // 'percent' or 'fixed'
        defaultCommissionValue: 100,
        defaultPaymentTerms: 'שוטף + 30',
        currency: 'ILS'
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFinanceSettings(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-bg-card p-6 rounded-xl border border-border-default shadow-sm">
                <h3 className="text-lg font-bold text-text-default mb-4 flex items-center gap-2">
                    <BanknotesIcon className="w-5 h-5 text-primary-500" />
                    ברירת מחדל ללקוחות חדשים
                </h3>
                <p className="text-sm text-text-muted mb-6">
                    הגדרות אלו יחולו אוטומטית בעת יצירת לקוח חדש או הוספת עסקה ללקוח ללא הסכם מוגדר.
                    ניתן לדרוס הגדרות אלו ברמת הלקוח הספציפי.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">מודל עמלה (ברירת מחדל)</label>
                        <select 
                            name="defaultCommissionType" 
                            value={financeSettings.defaultCommissionType} 
                            onChange={handleChange}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                        >
                            <option value="percent">אחוז מהשכר (ברוטו)</option>
                            <option value="fixed">סכום קבוע (Fixed Fee)</option>
                        </select>
                    </div>

                    <div>
                         <label className="block text-sm font-semibold text-text-muted mb-1.5">
                            {financeSettings.defaultCommissionType === 'percent' ? 'גובה העמלה (%)' : 'סכום העמלה'}
                         </label>
                         <div className="relative">
                            <input 
                                type="number" 
                                name="defaultCommissionValue" 
                                value={financeSettings.defaultCommissionValue} 
                                onChange={handleChange} 
                                className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle font-bold">
                                {financeSettings.defaultCommissionType === 'percent' ? '%' : '₪'}
                            </span>
                         </div>
                    </div>

                     <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">תנאי תשלום</label>
                        <select 
                            name="defaultPaymentTerms" 
                            value={financeSettings.defaultPaymentTerms} 
                            onChange={handleChange}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                        >
                            <option>מיידי</option>
                            <option>שוטף + 30</option>
                            <option>שוטף + 45</option>
                            <option>שוטף + 60</option>
                            <option>שוטף + 90</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">מטבע</label>
                        <select 
                            name="currency" 
                            value={financeSettings.currency} 
                            onChange={handleChange}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                        >
                            <option value="ILS">שקל חדש (₪)</option>
                            <option value="USD">דולר ($)</option>
                            <option value="EUR">אירו (€)</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
                <InformationCircleIcon className="w-6 h-6 text-blue-600 flex-shrink-0" />
                <div>
                    <h4 className="font-bold text-blue-900 text-sm">כיצד זה משפיע?</h4>
                    <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                        כאשר תבצעו "הזנת השמה ידנית" או תפיקו דרישת תשלום ללקוח ללא הגדרות ספציפיות, המערכת תשתמש בערכים אלו לחישוב אוטומטי של סכום החיוב.
                        <br/>
                        שינוי כאן לא ישפיע על עסקאות שכבר נוצרו.
                    </p>
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <button className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 transition shadow-md">
                    שמור הגדרות ברירת מחדל
                </button>
            </div>
        </div>
    );
};


const CompanySettingsView: React.FC = () => {
    const { t } = useLanguage();
    const { user } = useAuth();
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const tenantClientId = user?.clientId?.trim() || null;
    const [adminClientId, setAdminClientId] = useState<string | null>(null);
    const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
    const [clientsListLoading, setClientsListLoading] = useState(false);
    const usageClientId = isPlatformAdmin ? adminClientId : tenantClientId;
    const [clientDetails, setClientDetails] = useState<ClientDetailsRow | null>(null);
    const [clientDetailsLoading, setClientDetailsLoading] = useState(false);
    const [clientDetailsError, setClientDetailsError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'details' | 'parameters' | 'quota' | 'usage' | 'tags' | 'custom_fields' | 'health' | 'client_health' | 'finance_defaults'>('details');
    const [monthlyGoal, setMonthlyGoal] = useState('20');
    const [matchingConfigs, setMatchingConfigs] = useState<ClientMatchingEnginePresetDto[]>([]);
    const [matchingConfigsLoading, setMatchingConfigsLoading] = useState(false);
    const [matchingConfigsError, setMatchingConfigsError] = useState<string | null>(null);
    const [matchingClientOptions, setMatchingClientOptions] = useState<ClientOption[]>([]);
    const [selectedMatchingPresetId, setSelectedMatchingPresetId] = useState<number | null>(null);
    const [savedMatchingPresetId, setSavedMatchingPresetId] = useState<number | null>(null);
    const [matchingUsageLoadError, setMatchingUsageLoadError] = useState<string | null>(null);
    const [matchingPresetSaveError, setMatchingPresetSaveError] = useState<string | null>(null);
    const [isSavingMatchingPreset, setIsSavingMatchingPreset] = useState(false);
    const [posthogKey, setPosthogKey] = useState('');
    const [posthogHost, setPosthogHost] = useState(DEFAULT_POSTHOG_HOST);
    const [savedPosthog, setSavedPosthog] = useState<PosthogAnalyticsConfig>({ key: '', host: DEFAULT_POSTHOG_HOST });
    const [posthogLoading, setPosthogLoading] = useState(false);
    const [posthogLoadError, setPosthogLoadError] = useState<string | null>(null);
    const [posthogSaveError, setPosthogSaveError] = useState<string | null>(null);
    const [isSavingPosthog, setIsSavingPosthog] = useState(false);
    const [posthogSaveSuccess, setPosthogSaveSuccess] = useState(false);

    useEffect(() => {
        if (!usageClientId) {
            setSelectedMatchingPresetId(null);
            setSavedMatchingPresetId(null);
            setMatchingUsageLoadError(null);
            return;
        }
        let cancelled = false;
        fetchClientUsageSettings(usageClientId)
            .then((d) => {
                if (cancelled) return;
                const mid =
                    typeof d.matchingEnginePresetId === 'number' && Number.isFinite(d.matchingEnginePresetId)
                        ? d.matchingEnginePresetId
                        : null;
                setSelectedMatchingPresetId(mid);
                setSavedMatchingPresetId(mid);
                setMatchingUsageLoadError(null);
            })
            .catch((e: Error) => {
                if (!cancelled) setMatchingUsageLoadError(e.message || 'טעינת הגדרות נכשלה');
            });
        return () => {
            cancelled = true;
        };
    }, [usageClientId]);

    const handleSaveMatchingPreset = useCallback(async () => {
        if (!usageClientId) return;
        setMatchingPresetSaveError(null);
        setIsSavingMatchingPreset(true);
        try {
            const cur = await fetchClientUsageSettings(usageClientId);
            const saved = await saveClientUsageSettings(usageClientId, {
                ...cur,
                matchingEnginePresetId: selectedMatchingPresetId,
            });
            const next =
                typeof saved.matchingEnginePresetId === 'number' && Number.isFinite(saved.matchingEnginePresetId)
                    ? saved.matchingEnginePresetId
                    : null;
            setSavedMatchingPresetId(next);
            setSelectedMatchingPresetId(next);
        } catch (e: unknown) {
            setMatchingPresetSaveError(e instanceof Error ? e.message : 'שמירה נכשלה');
        } finally {
            setIsSavingMatchingPreset(false);
        }
    }, [usageClientId, selectedMatchingPresetId]);

    useEffect(() => {
        if (!usageClientId) {
            setPosthogKey('');
            setPosthogHost(DEFAULT_POSTHOG_HOST);
            setSavedPosthog({ key: '', host: DEFAULT_POSTHOG_HOST });
            setPosthogLoadError(null);
            return;
        }
        let cancelled = false;
        setPosthogLoading(true);
        setPosthogLoadError(null);
        fetchPosthogAnalytics(usageClientId)
            .then((cfg) => {
                if (cancelled) return;
                const next = {
                    key: cfg.key || '',
                    host: cfg.host || DEFAULT_POSTHOG_HOST,
                };
                setPosthogKey(next.key);
                setPosthogHost(next.host);
                setSavedPosthog(next);
            })
            .catch((e: Error) => {
                if (!cancelled) setPosthogLoadError(e.message || 'טעינת הגדרות PostHog נכשלה');
            })
            .finally(() => {
                if (!cancelled) setPosthogLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [usageClientId]);

    const handleSavePosthog = useCallback(async () => {
        if (!usageClientId) return;
        setPosthogSaveError(null);
        setPosthogSaveSuccess(false);
        setIsSavingPosthog(true);
        try {
            const saved = await savePosthogAnalytics({
                key: posthogKey.trim(),
                host: posthogHost.trim() || DEFAULT_POSTHOG_HOST,
            }, usageClientId);
            const next = {
                key: saved.key || '',
                host: saved.host || DEFAULT_POSTHOG_HOST,
            };
            setSavedPosthog(next);
            setPosthogKey(next.key);
            setPosthogHost(next.host);
            setPosthogSaveSuccess(true);
            setTimeout(() => setPosthogSaveSuccess(false), 2500);
        } catch (e: unknown) {
            setPosthogSaveError(e instanceof Error ? e.message : 'שמירה נכשלה');
        } finally {
            setIsSavingPosthog(false);
        }
    }, [usageClientId, posthogKey, posthogHost]);

    const posthogDirty =
        posthogKey.trim() !== savedPosthog.key.trim() ||
        (posthogHost.trim() || DEFAULT_POSTHOG_HOST) !== (savedPosthog.host || DEFAULT_POSTHOG_HOST);

    useEffect(() => {
        if (!usageClientId) {
            setMatchingConfigs([]);
            setMatchingConfigsError(null);
            setMatchingConfigsLoading(false);
            return;
        }
        let cancelled = false;
        setMatchingConfigsLoading(true);
        setMatchingConfigsError(null);
        fetchClientMatchingEngineConfigs(usageClientId)
            .then((rows) => {
                if (!cancelled) setMatchingConfigs(rows);
            })
            .catch((e: Error) => {
                if (!cancelled) setMatchingConfigsError(e.message || 'טעינה נכשלה');
            })
            .finally(() => {
                if (!cancelled) setMatchingConfigsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [usageClientId]);

    useEffect(() => {
        if (!API_BASE) {
            setClientOptions([]);
            return;
        }
        let cancelled = false;
        setClientsListLoading(true);
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/api/clients?activeOnly=true`, { headers: authHeaders(true), cache: 'no-store' });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data.data ?? []);
                setClientOptions(
                    list.map((c: Record<string, unknown>) => ({
                        id: String(c.id ?? ''),
                        name: String(c.name ?? ''),
                        displayName: c.displayName ? String(c.displayName) : undefined,
                    })),
                );
            } catch {
                if (!cancelled) setClientOptions([]);
            } finally {
                if (!cancelled) setClientsListLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!usageClientId || !API_BASE) {
            setClientDetails(null);
            setClientDetailsError(null);
            return;
        }
        let cancelled = false;
        setClientDetailsLoading(true);
        setClientDetailsError(null);
        fetch(`${API_BASE}/api/clients/${encodeURIComponent(usageClientId)}`, {
            headers: authHeaders(true),
            cache: 'no-store',
        })
            .then((res) => {
                if (!res.ok) throw new Error('טעינת פרטי לקוח נכשלה');
                return res.json();
            })
            .then((row: ClientDetailsRow) => {
                if (!cancelled) setClientDetails(row);
            })
            .catch((e: Error) => {
                if (!cancelled) setClientDetailsError(e.message || 'טעינת פרטי לקוח נכשלה');
            })
            .finally(() => {
                if (!cancelled) setClientDetailsLoading(false);
            });
        return () => { cancelled = true; };
    }, [usageClientId]);

    const selectedClientLabel = useMemo(() => {
        if (!usageClientId) return '';
        const hit = clientOptions.find((c) => c.id === usageClientId);
        return hit?.displayName || hit?.name || clientDetails?.displayName || clientDetails?.name || '';
    }, [clientOptions, usageClientId, clientDetails]);

    useEffect(() => {
        if (!usageClientId) {
            setMatchingClientOptions([]);
            return;
        }
        setMatchingClientOptions(clientOptions.filter((c) => c.id));
    }, [usageClientId, clientOptions]);

    const renderContent = () => {
        switch (activeTab) {
            case 'details':
                return (
                    <div className="space-y-6 animate-fade-in">
                        {!usageClientId && (
                            <p className="text-sm text-text-muted text-right py-2">
                                {isPlatformAdmin
                                    ? 'בחרו לקוח מהרשימה למעלה כדי לצפות ולערוך הגדרות.'
                                    : 'אין לחשבון משתמש מזהה לקוח — לא ניתן להציג הגדרות.'}
                            </p>
                        )}
                        {clientDetailsError && (
                            <p className="text-sm text-red-600 text-right">{clientDetailsError}</p>
                        )}
                        {usageClientId && (
                        <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <SettingsInput
                                label={t('company_settings.field_company_name')}
                                value={clientDetailsLoading ? '…' : (clientDetails?.name || selectedClientLabel || '—')}
                            />
                            <SettingsInput
                                label={t('company_settings.field_display_name')}
                                value={clientDetailsLoading ? '…' : (clientDetails?.displayName || clientDetails?.name || '—')}
                            />
                            <SettingsInput
                                label={t('company_settings.field_creation_date')}
                                value={clientDetails?.createdAt
                                    ? new Date(clientDetails.createdAt).toLocaleDateString('he-IL')
                                    : '—'}
                            />
                            <SettingsInput
                                label={t('company_settings.field_sms_source')}
                                value={String((clientDetails?.metadata as Record<string, unknown> | undefined)?.smsSource || clientDetails?.domain || '—')}
                            />
                            <SettingsInput label={t('company_settings.field_ips')} value="" />
                            <SettingsInput
                                label={t('company_settings.field_verified_phones')}
                                value={String((clientDetails?.metadata as Record<string, unknown> | undefined)?.verifiedPhones || '—')}
                            />
                        </div>

                        <ClientBrandingSection clientId={usageClientId} />
                        
                        {/* Matching Engine — preset cards + selection stored in client_usage_settings.matching_engine_preset_id */}
                        <div className="bg-white p-6 rounded-2xl border border-border-subtle shadow-sm mt-6">
                            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <SparklesIcon className="w-5 h-5 text-primary-500" />
                                    <h3 className="text-lg font-bold text-text-default">תבניות שקלול (גישות)</h3>
                                </div>
                                {usageClientId && matchingConfigs.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => void handleSaveMatchingPreset()}
                                        disabled={
                                            isSavingMatchingPreset ||
                                            selectedMatchingPresetId === savedMatchingPresetId
                                        }
                                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
                                            selectedMatchingPresetId !== savedMatchingPresetId
                                                ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-500/20'
                                                : 'bg-bg-subtle text-text-muted cursor-not-allowed'
                                        }`}
                                    >
                                        {isSavingMatchingPreset ? (
                                            <ArrowPathIcon className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <CheckCircleIcon className="w-5 h-5" />
                                        )}
                                        שמור בחירה
                                    </button>
                                )}
                            </div>
                            {!usageClientId && (
                                <p className="text-sm text-text-muted text-right py-2">
                                    אין לחשבון משתמש מזהה לקוח — לא ניתן להציג הגדרות מנוע התאמה.
                                </p>
                            )}
                            {usageClientId && matchingUsageLoadError && (
                                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2 text-right">
                                    {matchingUsageLoadError}
                                </p>
                            )}
                            {usageClientId && matchingPresetSaveError && (
                                <p className="text-sm text-red-600 text-right py-2">{matchingPresetSaveError}</p>
                            )}
                            {usageClientId && matchingConfigsLoading && (
                                <p className="text-sm text-text-muted text-right py-2">טוען הגדרות מנוע התאמה…</p>
                            )}
                            {usageClientId && matchingConfigsError && (
                                <p className="text-sm text-red-600 text-right py-2">{matchingConfigsError}</p>
                            )}
                            {usageClientId &&
                                !matchingConfigsLoading &&
                                !matchingConfigsError &&
                                savedMatchingPresetId != null &&
                                matchingConfigs.length > 0 &&
                                !matchingConfigs.some((p) => p.id === savedMatchingPresetId) && (
                                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2 text-right">
                                        הגישה השמורה במערכת אינה מופיעה ברשימה (ייתכן שהוסרה). בחרו גישה חדשה
                                        ושמרו.
                                    </p>
                                )}
                            {usageClientId && !matchingConfigsLoading && !matchingConfigsError && matchingConfigs.length === 0 && (
                                <p className="text-sm text-text-muted italic py-2 text-right">
                                    אין גישות שמורות המקושרות ללקוח שלכם. ניתן להגדיר זאת בממשק הניהול — מנוע התאמה.
                                </p>
                            )}
                            {usageClientId &&
                                !matchingConfigsLoading &&
                                !matchingConfigsError &&
                                matchingConfigs.length > 0 &&
                                selectedMatchingPresetId !== savedMatchingPresetId && (
                                    <p className="text-sm text-primary-800 bg-primary-50 border border-primary-100 rounded-lg px-3 py-2 mb-3 text-right">
                                        יש שינויים שלא נשמרו — יש ללחוץ על שמור בחירה לעדכון המערכת.
                                    </p>
                                )}
                            {usageClientId && !matchingConfigsLoading && !matchingConfigsError && matchingConfigs.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {matchingConfigs.map((preset) => {
                                        const isSelected = selectedMatchingPresetId === preset.id;
                                        const isPersisted =
                                            savedMatchingPresetId === preset.id &&
                                            selectedMatchingPresetId === savedMatchingPresetId;
                                        return (
                                            <button
                                                key={preset.id}
                                                type="button"
                                                onClick={() => setSelectedMatchingPresetId(preset.id)}
                                                className={`p-4 rounded-xl border transition-all text-right group relative flex flex-col items-start h-full
                                                    ${
                                                        isSelected
                                                            ? 'border-purple-500 ring-2 ring-purple-500 bg-purple-50 shadow-md shadow-purple-200'
                                                            : 'border-purple-200 bg-purple-50/30 hover:bg-purple-50 hover:border-purple-500 hover:ring-1 hover:ring-purple-500'
                                                    }`}
                                            >
                                                {isPersisted && (
                                                    <span className="absolute top-2.5 right-2.5 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                        פעיל
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-2 mb-2 pr-8 w-full">
                                                    <div
                                                        className={`p-2 bg-white rounded-lg shadow-sm transition-colors shrink-0 ${
                                                            isSelected
                                                                ? 'text-purple-600'
                                                                : 'group-hover:text-purple-600 text-purple-400'
                                                        }`}
                                                    >
                                                        <TagIcon className="w-5 h-5" />
                                                    </div>
                                                    <h3 className="font-bold text-text-default truncate">
                                                        {preset.label || preset.configKey || `Preset #${preset.id}`}
                                                    </h3>
                                                </div>
                                                <p className="text-xs text-text-muted leading-relaxed mb-1 line-clamp-2">
                                                    {preset.description || 'גישה מותאמת אישית'}
                                                </p>
                                                <PresetMainWeightsMiniBar config={preset.config} />
                                                {preset.clientIds && preset.clientIds.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-auto">
                                                        {preset.clientIds.map((cid) => {
                                                            const client = matchingClientOptions.find((c) => c.id === cid);
                                                            return (
                                                                <span
                                                                    key={cid}
                                                                    className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                                                >
                                                                    {client ? client.displayName || client.name : cid}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {usageClientId && !matchingConfigsLoading && !matchingConfigsError && matchingConfigs.length > 0 && (
                                <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        className="text-xs font-semibold text-text-muted hover:text-primary-600 underline"
                                        onClick={() => setSelectedMatchingPresetId(null)}
                                    >
                                        נקה בחירה (ברירת מחדל לפי סדר המערכת)
                                    </button>
                                </div>
                            )}
                            <p className="text-xs text-text-muted mt-4 text-right leading-relaxed">
                                הבחירה נשמרת בהגדרות השימוש של הלקוח (client_usage_settings). ללא בחירה, המערכת
                                משתמשת בגישה הראשונה המתאימה ללקוח. עריכת תבניות — ממשק הניהול מנוע התאמה.
                            </p>
                        </div>

                        {/* PostHog — per-client landing page analytics */}
                        <div className="bg-white p-6 rounded-2xl border border-border-subtle shadow-sm mt-6">
                            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <ChartBarIcon className="w-5 h-5 text-primary-500" />
                                    <h3 className="text-lg font-bold text-text-default">PostHog — אנליטיקה לדפי פרסום</h3>
                                </div>
                                {usageClientId && (
                                    <button
                                        type="button"
                                        onClick={() => void handleSavePosthog()}
                                        disabled={isSavingPosthog || posthogLoading || !posthogDirty}
                                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
                                            posthogDirty && !posthogLoading
                                                ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-500/20'
                                                : 'bg-bg-subtle text-text-muted cursor-not-allowed'
                                        }`}
                                    >
                                        {isSavingPosthog ? (
                                            <ArrowPathIcon className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <CheckCircleIcon className="w-5 h-5" />
                                        )}
                                        שמור הגדרות PostHog
                                    </button>
                                )}
                            </div>
                            {!usageClientId && (
                                <p className="text-sm text-text-muted text-right py-2">
                                    אין לחשבון משתמש מזהה לקוח — לא ניתן להגדיר PostHog.
                                </p>
                            )}
                            {usageClientId && posthogLoading && (
                                <p className="text-sm text-text-muted text-right py-2">טוען הגדרות PostHog…</p>
                            )}
                            {usageClientId && posthogLoadError && (
                                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2 text-right">
                                    {posthogLoadError}
                                </p>
                            )}
                            {usageClientId && posthogSaveError && (
                                <p className="text-sm text-red-600 text-right py-2">{posthogSaveError}</p>
                            )}
                            {usageClientId && posthogSaveSuccess && (
                                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2 text-right">
                                    הגדרות PostHog נשמרו בהצלחה.
                                </p>
                            )}
                            {usageClientId && !posthogLoading && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <SettingsInput
                                        label="מפתח פרויקט (Project API Key)"
                                        subLabel="phc_…"
                                        value={posthogKey}
                                        onChange={setPosthogKey}
                                        placeholder="phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                    />
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-sm font-semibold text-text-default text-right">
                                            אזור (API Host)
                                        </label>
                                        <p className="text-xs text-text-muted text-right">
                                            חייב להתאים לאזור הפרויקט ב־PostHog (Settings → Project → Region).
                                        </p>
                                        <select
                                            value={
                                                POSTHOG_HOST_OPTIONS.some((o) => o.value === posthogHost)
                                                    ? posthogHost
                                                    : DEFAULT_POSTHOG_HOST
                                            }
                                            onChange={(e) => setPosthogHost(e.target.value)}
                                            className="w-full bg-bg-subtle border border-border-default rounded-xl px-4 py-3 font-medium text-text-default focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none transition-all text-right"
                                        >
                                            {POSTHOG_HOST_OPTIONS.map((opt) => (
                                                <option key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                            <p className="text-xs text-text-muted mt-4 text-right leading-relaxed">
                                המפתח נשמר בהגדרות הלקוח ונטען אוטומטית בדפי הגיוס הציבוריים שלכם (צפיות, התחלת מועמדות,
                                הגשות). אם לא הוגדר מפתח ללקוח, המערכת תשתמש ב־<code className="font-mono text-[11px]">VITE_POSTHOG_KEY</code> מקובץ הסביבה — אם קיים.
                                אם בקונסול מופיע 401 על <code className="font-mono text-[11px]">/flags</code> או 404 על config — בדרך כלל האזור שגוי (US במקום EU או להיפך).
                            </p>
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
                        </>
                        )}
                    </div>
                );
            case 'quota':
                if (!isPlatformAdmin) {
                    return (
                        <p className="text-sm text-text-muted text-right py-4">
                            מכסות שימוש זמינות למנהלי מערכת בלבד.
                        </p>
                    );
                }
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
                 return <ParametersTab clientId={usageClientId} />;
            case 'usage':
                return <UsageSettingsTab clientId={usageClientId} />;
            case 'tags':
                return <CompanyTagsSettingsView />;
            case 'custom_fields':
                return <CustomFieldsSettingsView />;
            case 'health':
                return <JobHealthSettingsView />;
            case 'client_health':
                return <ClientHealthSettingsView />;
            case 'finance_defaults':
                return <FinanceDefaultsTab />;
            default:
                return null;
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fadeIn 0.3s ease-out; }`}</style>
            <header className="flex-shrink-0 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <h1 className="text-2xl font-bold text-text-default">{t('company_settings.title')}</h1>
                    {isPlatformAdmin ? (
                        <div className="min-w-[14rem] w-full sm:w-auto">
                            <SearchableSelect
                                options={clientOptions.map((c) => ({
                                    id: c.id,
                                    label: c.displayName || c.name,
                                }))}
                                value={adminClientId}
                                onChange={(val) => setAdminClientId(val ? String(val) : null)}
                                placeholder="בחרו לקוח"
                                className="w-full"
                                icon={<BuildingOffice2Icon className="w-4 h-4 text-text-subtle" />}
                                disabled={clientsListLoading}
                            />
                        </div>
                    ) : selectedClientLabel ? (
                        <p className="text-sm font-semibold text-primary-700">לקוח: {selectedClientLabel}</p>
                    ) : null}
                </div>
                <div className="border-b border-border-default overflow-x-auto">
                    <nav className="flex items-center -mb-px min-w-max gap-2">
                        <TabButton title={t('company_settings.tab_details')} isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} />
                        <TabButton title={t('company_settings.tab_quota')} isActive={activeTab === 'quota'} onClick={() => setActiveTab('quota')} />
                        <TabButton title={t('company_settings.tab_params')} isActive={activeTab === 'parameters'} onClick={() => setActiveTab('parameters')} />
                        <TabButton title={t('company_settings.tab_usage')} isActive={activeTab === 'usage'} onClick={() => setActiveTab('usage')} />
                        <TabButton title={t('company_settings.tab_tags')} isActive={activeTab === 'tags'} onClick={() => setActiveTab('tags')} />
                        <TabButton title={t('company_settings.tab_custom_fields')} isActive={activeTab === 'custom_fields'} onClick={() => setActiveTab('custom_fields')} />
                        <TabButton title="דופק משרה" isActive={activeTab === 'health'} onClick={() => setActiveTab('health')} icon={<ChartBarIcon className="w-4 h-4"/>}/>
                        <TabButton title="דופק לקוח" isActive={activeTab === 'client_health'} onClick={() => setActiveTab('client_health')} icon={<ChartBarIcon className="w-4 h-4"/>}/>
                        <TabButton title="הגדרות כספים" isActive={activeTab === 'finance_defaults'} onClick={() => setActiveTab('finance_defaults')} icon={<BanknotesIcon className="w-4 h-4"/>} />
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
