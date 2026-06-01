# Addendum for DB prompt `create_new_job` (v10.5+)

Merge the following into your **JSON Schema** block and **Core Rules** in the `create_new_job` prompt template.

## JSON Schema — add these fields (after `licenseType` / before `postingCode` or at end of scalar fields)

```text
    ageMin: { type: DataTypes.INTEGER, comment: 'Minimum candidate age (18–70); null if not stated' },
    ageMax: { type: DataTypes.INTEGER, comment: 'Maximum candidate age (18–70); null if not stated' },
    availability: { type: DataTypes.STRING, comment: 'Required start readiness — exact picklist string; null if not stated' },
    availabilityOptions: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [], comment: 'Acceptable start-readiness options (OR); [] if not stated' },
    licenseTypes: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [], comment: 'Acceptable driving licenses (OR); [] if not required' },
```

(Keep existing `licenseType` as the primary / first license when only one is required.)

## Core Rules — add section

```text
AGE (ageMin / ageMax):
- Extract ONLY when the posting states an age limit or range (e.g. "גיל 25-40", "מגיל 18", "עד גיל 65").
- Set integer ageMin and ageMax (18–70). For a range, set both endpoints.
- Also copy the verbatim age wording into internalNotes (ZERO INFORMATION LOSS).
- null / omit both when age is not mentioned.

AVAILABILITY (זמינות להתחלה — availability / availabilityOptions):
- When the job states when candidates must be able to start, map to EXACTLY one of these strings:
  * "🟢 מיידי (זמין לעבודה מיד)."
  * "🟡 חודש הודעה (עובד, מחפש אקטיבית)."
  * "🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting)."
  * "🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים)."
- Synonyms: "מיידי" / "זמין מיד" → green; "חודש הודעה" / "חודש התראה" → yellow; etc.
- Single acceptable level → set availability (string) and availabilityOptions: [] or one-element array.
- Multiple acceptable levels → availabilityOptions: [ ... ] (each exact picklist string); availability = first or strictest.
- Omit / null when start timing is not discussed.

DRIVING LICENSE (licenseType / licenseTypes):
- licenseType: primary requirement (e.g. "B", "רישיון נהיגה ורכב") or null.
- licenseTypes: all acceptable classes when several are listed (OR). [] if not required.
```

Note: The backend also appends `JOB_ANALYZE_FIELDS_APPENDIX` in code so analyze works even before you update the DB prompt; updating the DB keeps the model consistent with your documented schema.
