import React from 'react';
import type { CvProfileKind } from '../utils/cvProfileKind';

type CvProfileKindPickerProps = {
  value: CvProfileKind;
  onChange: (next: CvProfileKind) => void;
  disabled?: boolean;
};

const CvProfileKindPicker: React.FC<CvProfileKindPickerProps> = ({ value, onChange, disabled }) => (
  <div className="space-y-3">
    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">פרופיל לשליחה</h4>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label
        className={`flex items-start gap-3 cursor-pointer text-sm rounded-xl border px-3 py-2.5 transition-colors ${
          value === 'original'
            ? 'border-primary-200 bg-primary-50 text-primary-900'
            : 'border-border-default bg-bg-card text-text-default hover:border-primary-200'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <input
          type="radio"
          name="cv-profile-kind"
          className="mt-1"
          checked={value === 'original'}
          onChange={() => onChange('original')}
          disabled={disabled}
        />
        <span>
          <span className="font-semibold block">גרסת המועמד</span>
          <span className="text-text-subtle text-xs">הפרופיל החי כפי שנשמר למועמד.</span>
        </span>
      </label>
      <label
        className={`flex items-start gap-3 cursor-pointer text-sm rounded-xl border px-3 py-2.5 transition-colors ${
          value === 'shadow'
            ? 'border-primary-200 bg-primary-50 text-primary-900'
            : 'border-border-default bg-bg-card text-text-default hover:border-primary-200'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <input
          type="radio"
          name="cv-profile-kind"
          className="mt-1"
          checked={value === 'shadow'}
          onChange={() => onChange('shadow')}
          disabled={disabled}
        />
        <span>
          <span className="font-semibold block">עותק צל</span>
          <span className="text-text-subtle text-xs">רק העותק הצל הנעוץ (ברירת מחדל לשליחה).</span>
        </span>
      </label>
    </div>
  </div>
);

export default CvProfileKindPicker;
