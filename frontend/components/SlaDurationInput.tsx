import React from 'react';
import { ClockIcon } from './Icons';
import {
  cycleSlaUnit,
  normalizeSlaUnit,
  slaUnitLabel,
  type SlaUnit,
} from '../utils/slaDuration';

type SlaDurationInputProps = {
  value: number;
  unit?: SlaUnit | string | null;
  onValueChange: (value: number) => void;
  onUnitChange: (unit: SlaUnit) => void;
  min?: number;
  className?: string;
  inputClassName?: string;
  title?: string;
};

const SlaDurationInput: React.FC<SlaDurationInputProps> = ({
  value,
  unit,
  onValueChange,
  onUnitChange,
  min = 0,
  className = '',
  inputClassName = '',
  title,
}) => {
  const normalizedUnit = normalizeSlaUnit(unit);
  const numericValue = Number.isFinite(value) ? value : 0;

  return (
    <div
      className={`flex items-center gap-1.5 bg-bg-subtle/50 px-2 py-1 rounded-lg border border-border-default min-w-[8.75rem] ${className}`}
    >
      <button
        type="button"
        onClick={() => onUnitChange(cycleSlaUnit(normalizedUnit))}
        className="p-1 rounded-md text-text-subtle hover:text-primary-600 hover:bg-bg-card transition-colors shrink-0"
        title={title || `החלף יחידה (נוכחי: ${slaUnitLabel(normalizedUnit)})`}
        aria-label={`יחידת SLA: ${slaUnitLabel(normalizedUnit)}. לחץ להחלפה`}
      >
        <ClockIcon className="w-4 h-4" />
      </button>
      <input
        type="number"
        min={min}
        value={numericValue}
        onChange={(e) => onValueChange(parseInt(e.target.value, 10) || 0)}
        className={`w-10 min-w-[2.5rem] shrink-0 bg-transparent text-sm font-semibold text-center outline-none ${inputClassName}`}
        title={title}
      />
      <span className="text-xs text-text-muted whitespace-nowrap shrink-0 min-w-[2.5rem]">
        {slaUnitLabel(normalizedUnit)}
      </span>
    </div>
  );
};

export default SlaDurationInput;
