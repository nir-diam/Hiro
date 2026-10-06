
import React, { useState, useEffect, useCallback } from 'react';
import { LinkIcon, PencilIcon } from './Icons';
import AccordionSection from './AccordionSection'; 
import { useLanguage } from '../context/LanguageContext';
import {
    fetchPendingOrgProfileUpdate,
    submitOrgProfileUpdate,
    type OrgProfileAdditionalLocation,
    type OrgProfileUpdateDto,
} from '../services/organizationProfileUpdatesApi';
import { dispatchClientGamificationUpdated, mergeClientProfileUpdatePoints } from '../utils/clientGamification';
import ClientOrgProfileEditFields, {
    businessProfileToOrgEditValues,
    orgEditValuesToApiPayload,
    type ClientOrgProfileEditValues,
} from './ClientOrgProfileEditFields';

const InfoTag: React.FC<{ children: React.ReactNode; pending?: boolean }> = ({ children, pending }) => (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${pending ? 'bg-amber-100 text-amber-800' : 'bg-secondary-100 text-secondary-800'}`}>
        {children}
    </span>
);

const EMPLOYEE_COUNT_OPTIONS = ['1-10', '11-50', '51-200', '201-1000', '1000+', '10000+'];
const STRUCTURE_OPTIONS = [
    'חברה עצמאית (ללא שיוך)',
    'חברת בת (Subsidiary)',
    'חברת אם (Parent/Holding)',
];

const getPrimaryOrg = (client: any): Record<string, any> => {
    const links: any[] = Array.isArray(client?.organizationLinks) ? client.organizationLinks : [];
    const primary = links.find((l) => l.isPrimary) || links[0];
    return (primary?.organization && typeof primary.organization === 'object') ? primary.organization : {};
};

const parseAdditionalLocations = (raw: unknown): OrgProfileAdditionalLocation[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const row = item as Record<string, unknown>;
            const description = String(row.description || '').trim();
            const location = String(row.location || '').trim();
            const address = String(row.address || '').trim();
            if (!description && !location && !address) return null;
            return { description, location, address: address || undefined };
        })
        .filter((x): x is OrgProfileAdditionalLocation => x != null);
};

const getClientBusinessProfile = (client: any) => {
    const meta = (client?.metadata && typeof client.metadata === 'object') ? client.metadata : {};
    const org = getPrimaryOrg(client);

    const mainField = String(org.mainField || client?.industry || meta.mainField || '').trim();
    const mainField2 = (() => {
        const src = org.mainField2 ?? meta.mainField2;
        return Array.isArray(src) ? src.map((v: unknown) => String(v || '').trim()).filter(Boolean) : [];
    })();
    const subField = (() => {
        const src = org.subField ?? meta.subField;
        return Array.isArray(src) ? src.map((v: unknown) => String(v || '').trim()).filter(Boolean) : [];
    })();
    const secondaryField = String(org.secondaryField || meta.secondaryField || '').trim();
    const industryDisplay = [mainField, ...mainField2].filter(Boolean).join(' · ') || '—';

    const description = String(org.description || org.snippet || meta.description || meta.notes || '').trim();
    const products: string[] = (() => {
        const src = org.productType ?? org.subField ?? meta.products;
        return Array.isArray(src) ? src.map((v: unknown) => String(v || '').trim()).filter(Boolean) : [];
    })();
    const website = String(org.website || meta.website || '').trim();
    const employeeCount = String(org.employeeCount || meta.employeeCount || '').trim();
    const ownership = String(org.structure || org.type || meta.ownership || '').trim();
    const location = String(org.location || client?.city || meta.address || '').trim();
    const subsidiaries = Array.isArray(org.subsidiaries)
        ? org.subsidiaries.map((v: unknown) => String(v || '').trim()).filter(Boolean)
        : [];
    const additionalLocations = parseAdditionalLocations(org.additionalLocations);

    return {
        mainField,
        mainField2,
        subField,
        secondaryField,
        industryDisplay,
        description,
        products,
        website,
        employeeCount,
        ownership,
        location,
        subsidiaries,
        additionalLocations,
    };
};

const pendingToProfile = (pending: OrgProfileUpdateDto) => {
    const f = pending.proposedFields || {};
    const mainField2 = Array.isArray(f.mainField2) ? f.mainField2 : [];
    const subField = Array.isArray(f.subField) ? f.subField : [];
    const mainField = String(f.mainField || '').trim();
    const subsidiaries = Array.isArray(f.subsidiaries)
        ? f.subsidiaries.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
    return {
        mainField,
        mainField2,
        subField,
        secondaryField: String(f.secondaryField || '').trim(),
        industryDisplay: [mainField, ...mainField2].filter(Boolean).join(' · ') || '—',
        website: String(f.website || '').trim(),
        employeeCount: String(f.employeeCount || '').trim(),
        ownership: String(f.structure || '').trim(),
        location: String(f.location || '').trim(),
        subsidiaries,
        additionalLocations: parseAdditionalLocations(f.additionalLocations),
    };
};

interface ClientDetailsTabProps {
    client: any;
    /** When set (e.g. organization profile), pending updates are scoped to this org — not any org on the client. */
    organizationId?: string | null;
    onClientUpdated?: (next: any) => void;
}

const ClientDetailsTab: React.FC<ClientDetailsTabProps> = ({ client, organizationId, onClientUpdated }) => {
    const { t } = useLanguage();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const businessProfile = getClientBusinessProfile(client);
    const [profileForm, setProfileForm] = useState<ClientOrgProfileEditValues>(() =>
        businessProfileToOrgEditValues(businessProfile),
    );
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [pendingUpdate, setPendingUpdate] = useState<OrgProfileUpdateDto | null>(null);
    const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);

    const scopedOrganizationId = organizationId?.trim() || null;

    const loadPending = useCallback(async () => {
        if (!client?.id) return;
        try {
            const row = await fetchPendingOrgProfileUpdate(client.id, scopedOrganizationId);
            setPendingUpdate(row);
            if (row?.clientGamificationPoints != null) {
                dispatchClientGamificationUpdated(client.id, row.clientGamificationPoints);
            }
        } catch {
            setPendingUpdate(null);
        }
    }, [client?.id, scopedOrganizationId]);

    useEffect(() => {
        if (!client) return;
        setPendingUpdate(null);
        setProfileForm(businessProfileToOrgEditValues(getClientBusinessProfile(client)));
        setIsEditingProfile(false);
        loadPending();
    }, [client, scopedOrganizationId, loadPending]);

    const hasPending = Boolean(
        pendingUpdate
        && (
            !scopedOrganizationId
            || String(pendingUpdate.organizationId) === String(scopedOrganizationId)
        ),
    );

    const displayProfile = hasPending && pendingUpdate && !isEditingProfile
        ? pendingToProfile(pendingUpdate)
        : businessProfile;

    const startProfileEdit = () => {
        if (hasPending && pendingUpdate) {
            setProfileForm(businessProfileToOrgEditValues(pendingToProfile(pendingUpdate)));
        } else {
            setProfileForm(businessProfileToOrgEditValues(businessProfile));
        }
        setIsEditingProfile(true);
        setProfileError(null);
    };

    const cancelProfileEdit = () => {
        setIsEditingProfile(false);
        setProfileForm(businessProfileToOrgEditValues(businessProfile));
        setProfileError(null);
    };

    const handleSubmitProfile = async () => {
        if (!client?.id) return;
        setIsSubmittingProfile(true);
        setProfileError(null);
        try {
            const payload = orgEditValuesToApiPayload(profileForm);
            const row = await submitOrgProfileUpdate(client.id, payload, scopedOrganizationId);
            setPendingUpdate(row);
            setIsEditingProfile(false);
            if (row.clientGamificationPoints != null) {
                dispatchClientGamificationUpdated(client.id, row.clientGamificationPoints);
                onClientUpdated?.(mergeClientProfileUpdatePoints(client, row.clientGamificationPoints));
            }
        } catch (e: unknown) {
            setProfileError(e instanceof Error ? e.message : 'שליחה נכשלה');
        } finally {
            setIsSubmittingProfile(false);
        }
    };

    return (
        <div className="space-y-6">
            <AccordionSection title={t('client_details.section_info')} icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                 <div className="space-y-4 text-sm">
                    {hasPending && !isEditingProfile && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 font-semibold text-sm">
                            עדכון ממתין לאישור
                            {pendingUpdate?.createdAt && (
                                <span className="font-normal text-amber-800 mr-2">
                                    · הוגש {new Date(pendingUpdate.createdAt).toLocaleString('he-IL')}
                                </span>
                            )}
                        </div>
                    )}
                    <p className="text-text-muted leading-relaxed">
                        {businessProfile.description || '—'}
                    </p>
                    <div>
                        <h4 className="font-semibold text-text-default mb-2">{t('client_details.products_services')}</h4>
                        <div className="flex flex-wrap gap-2">
                            {businessProfile.products.slice(0, 8).map((p) => (
                                <InfoTag key={p}>{p}</InfoTag>
                            ))}
                            {businessProfile.products.length === 0 && <InfoTag>—</InfoTag>}
                        </div>
                    </div>

                    <div className="flex justify-end">
                        {!isEditingProfile ? (
                            <button
                                type="button"
                                onClick={startProfileEdit}
                                className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors"
                                title="עריכת פרטי ארגון"
                            >
                                <PencilIcon className="w-4 h-4" />
                                עריכה
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={cancelProfileEdit}
                                className="text-sm font-bold text-text-muted hover:text-text-default px-3 py-1.5"
                            >
                                ביטול
                            </button>
                        )}
                    </div>

                    {isEditingProfile ? (
                        <>
                            <ClientOrgProfileEditFields
                                apiBase={apiBase}
                                values={profileForm}
                                onChange={setProfileForm}
                                employeeCountOptions={EMPLOYEE_COUNT_OPTIONS}
                                structureOptions={STRUCTURE_OPTIONS}
                                labels={{
                                    employees: t('client_details.employees'),
                                    ownership: t('client_details.ownership'),
                                    location: t('client_details.location'),
                                    website: t('client_details.website'),
                                }}
                            />
                            <div className="flex justify-end pt-2">
                                <button
                                    type="button"
                                    disabled={isSubmittingProfile}
                                    onClick={handleSubmitProfile}
                                    className="bg-amber-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-amber-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isSubmittingProfile ? 'שולח...' : 'שלח לאישור'}
                                </button>
                            </div>
                            {profileError && <div className="text-sm font-semibold text-red-600">{profileError}</div>}
                        </>
                    ) : (
                        <dl className="space-y-2 pt-2 border-t border-border-default">
                            <div className="flex justify-between">
                                <dt className="text-text-muted">{t('client_details.industry')}</dt>
                                <dd className={`font-semibold text-right ${hasPending ? 'text-amber-800' : ''}`}>
                                    {displayProfile.industryDisplay}
                                    {hasPending && <span className="mr-2 text-xs font-bold text-amber-600">(ממתין)</span>}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                                <dt className="text-text-muted shrink-0">תחום עיסוק:</dt>
                                <dd className={`font-semibold text-right ${hasPending ? 'text-amber-800' : ''}`}>
                                    {displayProfile.subField.length > 0 ? (
                                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                                            {displayProfile.subField.map((item) => (
                                                <InfoTag key={item} pending={hasPending}>{item}</InfoTag>
                                            ))}
                                        </span>
                                    ) : '—'}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                                <dt className="text-text-muted shrink-0">תחום עיסוק משני:</dt>
                                <dd className={`font-semibold text-right ${hasPending ? 'text-amber-800' : ''}`}>{displayProfile.secondaryField || '—'}</dd>
                            </div>
                            <div className="flex justify-between"><dt className="text-text-muted">{t('client_details.employees')}</dt><dd className={`font-semibold ${hasPending ? 'text-amber-800' : ''}`}>{displayProfile.employeeCount || '—'}</dd></div>
                            <div className="flex justify-between"><dt className="text-text-muted">{t('client_details.ownership')}</dt><dd className={`font-semibold ${hasPending ? 'text-amber-800' : ''}`}>{displayProfile.ownership || '—'}</dd></div>
                            <div className="flex justify-between gap-4">
                                <dt className="text-text-muted shrink-0">חברות בנות:</dt>
                                <dd className={`font-semibold text-right ${hasPending ? 'text-amber-800' : ''}`}>
                                    {displayProfile.subsidiaries.length > 0 ? (
                                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                                            {displayProfile.subsidiaries.map((item) => (
                                                <InfoTag key={item} pending={hasPending}>{item}</InfoTag>
                                            ))}
                                        </span>
                                    ) : '—'}
                                </dd>
                            </div>
                            <div className="flex justify-between"><dt className="text-text-muted">{t('client_details.location')}</dt><dd className={`font-semibold ${hasPending ? 'text-amber-800' : ''}`}>{displayProfile.location || '—'}</dd></div>
                            <div className="flex justify-between gap-4">
                                <dt className="text-text-muted shrink-0">מיקומים נוספים:</dt>
                                <dd className={`font-semibold text-right text-sm ${hasPending ? 'text-amber-800' : ''}`}>
                                    {displayProfile.additionalLocations.length > 0 ? (
                                        <ul className="space-y-1">
                                            {displayProfile.additionalLocations.map((loc, i) => (
                                                <li key={`${loc.description}-${loc.location}-${i}`}>
                                                    {[loc.description, loc.location, loc.address].filter(Boolean).join(' · ') || '—'}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : '—'}
                                </dd>
                            </div>
                            <div className="flex justify-between items-center">
                                <dt className="text-text-muted">{t('client_details.website')}</dt>
                                <dd>
                                    {displayProfile.website ? (
                                        <a href={displayProfile.website.startsWith('http') ? displayProfile.website : `https://${displayProfile.website}`} target="_blank" rel="noopener noreferrer" className={`hover:underline font-semibold flex items-center gap-1 ${hasPending ? 'text-amber-700' : 'text-primary-600'}`}>
                                            <span>{displayProfile.website.replace('https://www.', '').replace('http://www.', '').replace('https://', '').replace('http://', '')}</span>
                                            <LinkIcon className="w-4 h-4" />
                                        </a>
                                    ) : (
                                        <span className="font-semibold">—</span>
                                    )}
                                </dd>
                            </div>
                        </dl>
                    )}
                 </div>
            </AccordionSection>
        </div>
    );
};

export default ClientDetailsTab;
