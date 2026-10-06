import React, { useState } from 'react';
import BusinessFieldHierarchyFields, {
    mainFieldsFromApi,
    mainFieldsToApi,
    type BusinessFieldHierarchyValues,
} from './BusinessFieldHierarchyFields';
import LocationSelector from './LocationSelector';
import { PlusIcon, XMarkIcon } from './Icons';
import type { OrgProfileAdditionalLocation } from '../services/organizationProfileUpdatesApi';

export type ClientOrgProfileEditValues = {
    hierarchy: BusinessFieldHierarchyValues;
    employeeCount: string;
    structure: string;
    subsidiaries: string[];
    location: string;
    additionalLocations: OrgProfileAdditionalLocation[];
    website: string;
};

type ClientOrgProfileEditFieldsProps = {
    apiBase: string;
    values: ClientOrgProfileEditValues;
    onChange: (next: ClientOrgProfileEditValues) => void;
    disabled?: boolean;
    employeeCountOptions: string[];
    structureOptions: string[];
    labels: {
        employees: string;
        ownership: string;
        location: string;
        website: string;
    };
};

const ClientOrgProfileEditFields: React.FC<ClientOrgProfileEditFieldsProps> = ({
    apiBase,
    values,
    onChange,
    disabled = false,
    employeeCountOptions,
    structureOptions,
    labels,
}) => {
    const [subsidiaryDraft, setSubsidiaryDraft] = useState('');

    const patch = (partial: Partial<ClientOrgProfileEditValues>) => {
        onChange({ ...values, ...partial });
    };

    const addSubsidiary = () => {
        const name = subsidiaryDraft.trim();
        if (!name || values.subsidiaries.includes(name)) return;
        patch({ subsidiaries: [...values.subsidiaries, name] });
        setSubsidiaryDraft('');
    };

    return (
        <div className="space-y-4 pt-2 border-t border-border-default">
            <BusinessFieldHierarchyFields
                apiBase={apiBase}
                values={values.hierarchy}
                onChange={(hierarchy) => patch({ hierarchy })}
                disabled={disabled}
                showSecondary
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1.5">{labels.employees}</label>
                    <select
                        name="employeeCount"
                        value={values.employeeCount}
                        disabled={disabled}
                        onChange={(e) => patch({ employeeCount: e.target.value })}
                        className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                    >
                        <option value="">—</option>
                        {employeeCountOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                        {values.employeeCount && !employeeCountOptions.includes(values.employeeCount) && (
                            <option value={values.employeeCount}>{values.employeeCount}</option>
                        )}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1.5">{labels.ownership}</label>
                    <select
                        name="structure"
                        value={values.structure}
                        disabled={disabled}
                        onChange={(e) => patch({ structure: e.target.value })}
                        className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                    >
                        <option value="">—</option>
                        {structureOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                        {values.structure && !structureOptions.includes(values.structure) && (
                            <option value={values.structure}>{values.structure}</option>
                        )}
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-sm font-semibold text-text-muted mb-1.5">חברות בנות</label>
                <div className="flex flex-wrap gap-2 mb-2">
                    {values.subsidiaries.map((name) => (
                        <span
                            key={name}
                            className="text-xs font-semibold px-2.5 py-1 rounded-full bg-secondary-100 text-secondary-800 inline-flex items-center gap-1"
                        >
                            {name}
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={() => patch({ subsidiaries: values.subsidiaries.filter((s) => s !== name) })}
                                    className="hover:text-red-600"
                                    aria-label="הסר"
                                >
                                    <XMarkIcon className="w-3 h-3" />
                                </button>
                            )}
                        </span>
                    ))}
                    {values.subsidiaries.length === 0 && (
                        <span className="text-xs text-text-muted">אין חברות בנות מוגדרות</span>
                    )}
                </div>
                {!disabled && (
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={subsidiaryDraft}
                            onChange={(e) => setSubsidiaryDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addSubsidiary();
                                }
                            }}
                            placeholder="שם חברה בת — Enter להוספה"
                            className="flex-1 bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                        />
                        <button
                            type="button"
                            onClick={addSubsidiary}
                            className="text-sm font-bold text-primary-600 px-3 py-2 rounded-lg border border-primary-200 hover:bg-primary-50"
                        >
                            הוסף
                        </button>
                    </div>
                )}
            </div>

            <div>
                <label className="block text-sm font-semibold text-text-muted mb-1.5">{labels.location}</label>
                <LocationSelector
                    selectedLocations={values.location ? [{ type: 'city', value: values.location }] : []}
                    onChange={(locs) => patch({ location: locs[0]?.value?.trim() || '' })}
                    placeholder="בחר עיר..."
                    className="w-full"
                    summarizeAsCityNames
                />
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h4 className="text-sm font-semibold text-text-default">מיקומים נוספים</h4>
                        <p className="text-xs text-text-muted mt-0.5">סניף, מרלוג, אתר ייצור וכו׳</p>
                    </div>
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() =>
                                patch({
                                    additionalLocations: [
                                        ...values.additionalLocations,
                                        { description: '', location: '', address: '' },
                                    ],
                                })
                            }
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 px-3 py-1.5 rounded-lg"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                            הוסף מיקום
                        </button>
                    )}
                </div>
                {values.additionalLocations.length === 0 ? (
                    <p className="text-xs text-text-muted border border-dashed border-border-subtle rounded-lg px-3 py-2">
                        אין מיקומים נוספים
                    </p>
                ) : (
                    <div className="space-y-3">
                        {values.additionalLocations.map((loc, index) => (
                            <div
                                key={`extra-loc-${index}`}
                                className="rounded-xl border border-border-default bg-bg-subtle/30 p-3 space-y-2"
                            >
                                <div className="flex justify-end">
                                    {!disabled && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                patch({
                                                    additionalLocations: values.additionalLocations.filter((_, i) => i !== index),
                                                })
                                            }
                                            className="text-xs font-bold text-red-600 hover:underline"
                                        >
                                            הסר
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-text-muted mb-1">תיאור</label>
                                        <input
                                            type="text"
                                            value={loc.description}
                                            disabled={disabled}
                                            onChange={(e) => {
                                                const next = [...values.additionalLocations];
                                                next[index] = { ...next[index], description: e.target.value };
                                                patch({ additionalLocations: next });
                                            }}
                                            placeholder="סניף / מרלוג"
                                            className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-text-muted mb-1">עיר</label>
                                        <LocationSelector
                                            selectedLocations={loc.location ? [{ type: 'city', value: loc.location }] : []}
                                            onChange={(locs) => {
                                                const next = [...values.additionalLocations];
                                                next[index] = { ...next[index], location: locs[0]?.value?.trim() || '' };
                                                patch({ additionalLocations: next });
                                            }}
                                            placeholder="בחר עיר..."
                                            className="w-full"
                                            summarizeAsCityNames
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-text-muted mb-1">כתובת</label>
                                        <input
                                            type="text"
                                            value={loc.address || ''}
                                            disabled={disabled}
                                            onChange={(e) => {
                                                const next = [...values.additionalLocations];
                                                next[index] = { ...next[index], address: e.target.value };
                                                patch({ additionalLocations: next });
                                            }}
                                            placeholder="רחוב ומספר"
                                            className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div>
                <label className="block text-sm font-semibold text-text-muted mb-1.5">{labels.website}</label>
                <input
                    type="text"
                    name="website"
                    value={values.website}
                    disabled={disabled}
                    onChange={(e) => patch({ website: e.target.value })}
                    className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                />
            </div>
        </div>
    );
};

export function businessProfileToOrgEditValues(profile: {
    mainField: string;
    mainField2: string[];
    subField: string[];
    secondaryField: string;
    employeeCount: string;
    ownership: string;
    location: string;
    website: string;
    subsidiaries: string[];
    additionalLocations: OrgProfileAdditionalLocation[];
}): ClientOrgProfileEditValues {
    return {
        hierarchy: {
            mainField: mainFieldsFromApi(profile.mainField, profile.mainField2),
            subField: profile.subField,
            secondaryField: profile.secondaryField,
        },
        employeeCount: profile.employeeCount,
        structure: profile.ownership,
        subsidiaries: profile.subsidiaries,
        location: profile.location,
        additionalLocations: profile.additionalLocations,
        website: profile.website,
    };
}

export function orgEditValuesToApiPayload(values: ClientOrgProfileEditValues) {
    const { mainField, mainField2 } = mainFieldsToApi(values.hierarchy.mainField);
    return {
        mainField,
        mainField2,
        subField: values.hierarchy.subField,
        secondaryField: values.hierarchy.secondaryField?.trim() || '',
        employeeCount: values.employeeCount.trim(),
        structure: values.structure.trim(),
        location: values.location.trim(),
        website: values.website.trim(),
        subsidiaries: values.subsidiaries,
        additionalLocations: values.additionalLocations
            .map((loc) => ({
                description: loc.description.trim(),
                location: loc.location.trim(),
                address: (loc.address || '').trim(),
            }))
            .filter((loc) => loc.description || loc.location || loc.address),
    };
}

export default ClientOrgProfileEditFields;
