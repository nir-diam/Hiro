import React from 'react';

interface ZoneLabelMarkerProps {
  /** Name to display inside the zone (e.g. "Chelsea") */
  name: string;
  /** Diameter of the outer zone circle in px (default 112) */
  zoneDiameter?: number;
  /** Extra class for the root element */
  className?: string;
}

const LABEL_HEIGHT = 34;
const LABEL_HORIZONTAL_PADDING = 18; // px per side estimate for pill
const CHAR_WIDTH_ESTIMATE = 8; // px per character (rough for font-size ~13px)
const DOT_SIZE = 10;

/**
 * Renders a zone circle (gold border) with either:
 * - A dot + name pill inside   — when the label fits within the circle diameter
 * - Just a dot                 — when the label is wider than the circle
 */
const ZoneLabelMarker: React.FC<ZoneLabelMarkerProps> = ({
  name,
  zoneDiameter = 112,
  className,
}) => {
  const estimatedLabelWidth = name.length * CHAR_WIDTH_ESTIMATE + LABEL_HORIZONTAL_PADDING * 2;
  const labelFits = estimatedLabelWidth <= zoneDiameter;

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: zoneDiameter,
        height: zoneDiameter,
        borderRadius: '50%',
        border: '1.194px solid rgba(186, 145, 86, 0.20)',
        background: 'rgba(186, 145, 86, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: labelFits ? 6 : 0,
      }}
    >
      {/* Center dot */}
      <div
        style={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: '50%',
          background: '#023F3C',
          flexShrink: 0,
        }}
      />

      {/* Label pill — only when it fits */}
      {labelFits && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: LABEL_HEIGHT,
            paddingInline: LABEL_HORIZONTAL_PADDING,
            borderRadius: 9999,
            border: '1px solid rgba(230, 230, 230, 0.30)',
            background: '#023F3C',
            whiteSpace: 'nowrap',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 0.2,
            maxWidth: zoneDiameter - 8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
      )}
    </div>
  );
};

export default ZoneLabelMarker;
