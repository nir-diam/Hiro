import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MagnifyingGlassIcon, XMarkIcon } from './Icons';
import {
    BUSINESS_FIELD_CATEGORY_ID,
    fetchPicklistCategoryValues,
    fetchPicklistSubcategories,
    picklistRowLabel,
    type PicklistSubcategoryRow,
    type PicklistValueRow,
} from '../services/picklistValuesApi';

export type BusinessFieldHierarchyValues = {
    mainField: string;
    subField: string;
    secondaryField?: string;
};

type BusinessFieldHierarchyFieldsProps = {
    apiBase: string;
    values: BusinessFieldHierarchyValues;
    onChange: (next: BusinessFieldHierarchyValues) => void;
    /** Show free-text secondary occupation field */
    showSecondary?: boolean;
    /** Compact layout for filter toolbar */
    compact?: boolean;
    className?: string;
};

const BusinessFieldHierarchyFields: React.FC<BusinessFieldHierarchyFieldsProps> = ({
    apiBase,
    values,
    onChange,
    showSecondary = true,
    compact = false,
    className = '',
}) => {
    const [industries, setIndustries] = useState<PicklistSubcategoryRow[]>([]);
    const [subFieldOptions, setSubFieldOptions] = useState<PicklistValueRow[]>([]);
    const [isMainPickerOpen, setIsMainPickerOpen] = useState(false);
    const [mainSearch, setMainSearch] = useState('');

    useEffect(() => {
        if (!apiBase) return;
        let cancelled = false;
        void fetchPicklistSubcategories(apiBase, BUSINESS_FIELD_CATEGORY_ID).then((rows) => {
            if (!cancelled) setIndustries(rows);
        });
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    useEffect(() => {
        if (!apiBase || !values.mainField) {
            setSubFieldOptions([]);
            return;
        }
        const selected = industries.find((i) => i.name === values.mainField);
        if (!selected) {
            setSubFieldOptions([]);
            return;
        }
        let cancelled = false;
        void fetchPicklistCategoryValues(apiBase, selected.id).then((rows) => {
            if (!cancelled) setSubFieldOptions(rows);
        });
        return () => {
            cancelled = true;
        };
    }, [apiBase, values.mainField, industries]);

    const filteredIndustries = useMemo(
        () =>
            industries.filter((cat) =>
                cat.name.toLowerCase().includes(mainSearch.trim().toLowerCase()),
            ),
        [industries, mainSearch],
    );

    const inputClass = compact
        ? 'w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none'
        : 'w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500';

    const selectMain = (name: string) => {
        onChange({
            ...values,
            mainField: name,
            subField: '',
        });
        setIsMainPickerOpen(false);
        setMainSearch('');
    };

    const mainPickerModal =
        isMainPickerOpen &&
        createPortal(
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <button
                    type="button"
                    className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
                    aria-label="סגור"
                    onClick={() => setIsMainPickerOpen(false)}
                />
                <div
                    className="relative z-10 w-full max-w-md max-h-[70vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-border-default overflow-hidden"
                    role="dialog"
                    aria-modal="true"
                >
                    <header className="flex justify-between items-center px-4 py-3 border-b border-border-default bg-bg-subtle/30">
                        <h3 className="font-bold text-text-default">בחר תעשיית אם</h3>
                        <button
                            type="button"
                            onClick={() => setIsMainPickerOpen(false)}
                            className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </header>
                    <div className="p-3 border-b border-border-subtle">
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="חפש תעשייה..."
                                value={mainSearch}
                                onChange={(e) => setMainSearch(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-9 text-sm focus:ring-1 focus:ring-primary-500"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 custom-scrollbar p-2">
                        {filteredIndustries.length === 0 ? (
                            <p className="text-sm text-text-muted text-center py-6">לא נמצאו תעשיות</p>
                        ) : (
                            filteredIndustries.map((ind) => (
                                <button
                                    key={ind.id}
                                    type="button"
                                    onClick={() => selectMain(ind.name)}
                                    className={`w-full text-right px-3 py-2.5 rounded-lg text-sm transition-colors mb-0.5 ${
                                        values.mainField === ind.name
                                            ? 'bg-primary-50 text-primary-700 font-bold border border-primary-100'
                                            : 'hover:bg-bg-hover text-text-default'
                                    }`}
                                >
                                    {ind.name}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>,
            document.body,
        );

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <div className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
                <div className={compact ? 'flex-1 min-w-[140px]' : ''}>
                    {!compact && (
                        <label className="block text-xs font-semibold text-text-muted mb-1">תעשיית אם</label>
                    )}
                    <button
                        type="button"
                        onClick={() => setIsMainPickerOpen(true)}
                        className={`${inputClass} text-right flex items-center justify-between gap-2 hover:border-primary-300 transition-colors`}
                    >
                        <span className={values.mainField ? 'text-text-default font-medium truncate' : 'text-text-muted'}>
                            {values.mainField || (compact ? 'תעשיית אם' : 'בחר מתוך רשימה…')}
                        </span>
                        <span className="text-text-subtle text-xs flex-shrink-0">▼</span>
                    </button>
                </div>

                <div className={compact ? 'flex-1 min-w-[140px]' : ''}>
                    {!compact && (
                        <label className="block text-xs font-semibold text-text-muted mb-1">תעשייה ראשית (תת-תחום)</label>
                    )}
                    <select
                        value={values.subField}
                        disabled={!values.mainField || subFieldOptions.length === 0}
                        onChange={(e) => onChange({ ...values, subField: e.target.value })}
                        className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        <option value="">
                            {!values.mainField
                                ? 'בחר תעשיית אם תחילה'
                                : subFieldOptions.length === 0
                                  ? 'אין תת-תחומים'
                                  : compact
                                    ? 'תעשייה ראשית'
                                    : 'בחר תת-תחום…'}
                        </option>
                        {subFieldOptions.map((row) => {
                            const label = picklistRowLabel(row);
                            return (
                                <option key={row.id} value={label}>
                                    {label}
                                </option>
                            );
                        })}
                    </select>
                </div>

                {showSecondary && (
                    <div className={compact ? 'flex-1 min-w-[160px]' : 'md:col-span-2'}>
                        {!compact && (
                            <label className="block text-xs font-semibold text-text-muted mb-1">תחום עיסוק משני</label>
                        )}
                        <input
                            type="text"
                            value={values.secondaryField ?? ''}
                            onChange={(e) => onChange({ ...values, secondaryField: e.target.value })}
                            placeholder={compact ? 'תחום עיסוק משני' : 'טקסט חופשי — תחומים נוספים (אופציונלי)'}
                            className={inputClass}
                        />
                    </div>
                )}
            </div>

            {values.mainField && (
                <button
                    type="button"
                    onClick={() => onChange({ mainField: '', subField: '', secondaryField: values.secondaryField ?? '' })}
                    className="text-xs font-bold text-text-muted hover:text-red-600 self-start"
                >
                    נקה תעשייה
                </button>
            )}

            {mainPickerModal}
        </div>
    );
};

export default BusinessFieldHierarchyFields;
