import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Editor, type IAllProps } from '@tinymce/tinymce-react';
import type { Editor as TinyMCEEditor } from 'tinymce';

import 'tinymce/tinymce';
import 'tinymce/models/dom/model';
import 'tinymce/themes/silver';
import 'tinymce/icons/default';
import 'tinymce/plugins/advlist';
import 'tinymce/plugins/autolink';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/link';
import 'tinymce/plugins/image';
import 'tinymce/plugins/charmap';
import 'tinymce/plugins/preview';
import 'tinymce/plugins/anchor';
import 'tinymce/plugins/searchreplace';
import 'tinymce/plugins/visualblocks';
import 'tinymce/plugins/code';
import 'tinymce/plugins/fullscreen';
import 'tinymce/plugins/insertdatetime';
import 'tinymce/plugins/media';
import 'tinymce/plugins/table';
import 'tinymce/plugins/help';
import 'tinymce/plugins/wordcount';
import 'tinymce/plugins/directionality';
import 'tinymce/skins/ui/oxide/skin.min.css';
import 'tinymce/skins/content/default/content.min.css';

export type ProposalTemplateEditorHandle = {
    insertContent: (html: string) => void;
    insertText: (text: string) => void;
    focus: () => void;
    getContent: () => string;
};

export type ProposalTemplateTinyMceEditorProps = {
    value: string;
    onChange: (html: string) => void;
    editorKey?: string;
    minHeight?: number;
    onRequestImageInsert?: () => void;
    onRequestAttachmentInsert?: () => void;
};

const CENTERED_LOGO_TABLE = `
<table style="width:100%;border-collapse:collapse;border:none;margin:0 auto 16px;">
  <tbody>
    <tr>
      <td style="border:none;text-align:center;padding:12px 0;width:100%;">
        <p style="margin:0;text-align:center;">{company_logo}</p>
      </td>
    </tr>
  </tbody>
</table>`;

const SIGNATURE_TABLE = `
<table style="width:100%;border-collapse:collapse;margin-top:32px;">
  <tbody>
    <tr>
      <td style="width:50%;border:1px solid #d1d5db;padding:24px 16px;text-align:center;vertical-align:bottom;">
        <p style="margin:0 0 48px;font-weight:bold;">חתימת הלקוח</p>
        <p style="margin:0;border-top:1px solid #9ca3af;padding-top:8px;">{contact_full_name}</p>
      </td>
      <td style="width:50%;border:1px solid #d1d5db;padding:24px 16px;text-align:center;vertical-align:bottom;">
        <p style="margin:0 0 48px;font-weight:bold;">חתימת הנציג</p>
        <p style="margin:0;border-top:1px solid #9ca3af;padding-top:8px;">{rep_name}</p>
      </td>
    </tr>
  </tbody>
</table>`;

const ProposalTemplateTinyMceEditor = forwardRef<ProposalTemplateEditorHandle, ProposalTemplateTinyMceEditorProps>(
    ({ value, onChange, editorKey, minHeight = 420, onRequestImageInsert, onRequestAttachmentInsert }, ref) => {
        const editorRef = useRef<TinyMCEEditor | null>(null);

        useImperativeHandle(ref, () => ({
            insertContent: (html: string) => {
                editorRef.current?.insertContent(html);
                editorRef.current?.focus();
            },
            insertText: (text: string) => {
                editorRef.current?.insertContent(editorRef.current.dom.encode(text));
                editorRef.current?.focus();
            },
            focus: () => editorRef.current?.focus(),
            getContent: () => editorRef.current?.getContent() || value || '',
        }));

        const init = useMemo<IAllProps['init']>(
            () => ({
                height: minHeight,
                menubar: 'file edit view insert format table tools',
                directionality: 'rtl',
                language: 'he_IL',
                language_url: 'https://cdn.jsdelivr.net/npm/tinymce-i18n@24.12.30/langs8/he_IL.js',
                license_key: 'gpl',
                skin: false,
                content_css: false,
                branding: false,
                promotion: false,
                statusbar: true,
                resize: true,
                plugins: [
                    'advlist',
                    'autolink',
                    'lists',
                    'link',
                    'image',
                    'charmap',
                    'preview',
                    'anchor',
                    'searchreplace',
                    'visualblocks',
                    'code',
                    'fullscreen',
                    'insertdatetime',
                    'media',
                    'table',
                    'help',
                    'wordcount',
                    'directionality',
                ],
                toolbar:
                    'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | ' +
                    'alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | ' +
                    'table tableinsertdialog tableprops tablecellprops | link image hiroimage hiroattachment | ' +
                    'hirologo hisignature | ltr rtl | removeformat code fullscreen',
                table_toolbar:
                    'tableprops tabledelete | tableinsertrowbefore tableinsertrowafter tabledeleterow | ' +
                    'tableinsertcolbefore tableinsertcolafter tabledeletecol | tablemergecells tablesplitcells',
                table_default_attributes: { border: '1' },
                table_default_styles: { 'border-collapse': 'collapse', width: '100%' },
                table_class_list: [
                    { title: 'ללא גבול', value: 'hiro-table-borderless' },
                    { title: 'גבול מלא', value: 'hiro-table-bordered' },
                ],
                font_family_formats:
                    'Arial=Arial,Helvetica,sans-serif;' +
                    'David=David,serif;' +
                    'Times New Roman=Times New Roman,Times,serif;' +
                    'Tahoma=Tahoma,sans-serif;' +
                    'Rubik=Rubik,sans-serif;' +
                    'Assistant=Assistant,sans-serif',
                fontsize_formats: '10px 11px 12px 14px 16px 18px 20px 24px 28px 32px 36px',
                content_style: `
                    body {
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 14px;
                        direction: rtl;
                        text-align: right;
                        line-height: 1.6;
                        color: #111827;
                        padding: 12px 16px;
                    }
                    table { border-collapse: collapse; }
                    table.hiro-table-borderless, table.hiro-table-borderless td, table.hiro-table-borderless th {
                        border: none !important;
                    }
                    table.hiro-table-bordered, table.hiro-table-bordered td, table.hiro-table-bordered th {
                        border: 1px solid #d1d5db;
                    }
                    img { max-width: 100%; height: auto; }
                    ol, ul {
                        direction: rtl;
                        text-align: right;
                        padding-left: 0;
                        margin-right: 0;
                    }
                    ol {
                        list-style-type: decimal;
                        list-style-position: outside;
                        padding-right: 1.75em;
                    }
                    ul {
                        list-style-type: disc;
                        list-style-position: outside;
                        padding-right: 1.5em;
                    }
                    li {
                        display: list-item;
                        direction: rtl;
                        text-align: right;
                    }
                `,
                setup: (editor) => {
                    editor.ui.registry.addButton('hiroimage', {
                        icon: 'image',
                        tooltip: 'הוסף תמונה מהמאגר',
                        onAction: () => onRequestImageInsert?.(),
                    });
                    editor.ui.registry.addButton('hiroattachment', {
                        icon: 'upload',
                        tooltip: 'הוסף צרופה',
                        onAction: () => onRequestAttachmentInsert?.(),
                    });
                    editor.ui.registry.addButton('hirologo', {
                        text: 'לוגו ממורכז',
                        tooltip: 'הוסף טבלה ללוגו במרכז',
                        onAction: () => editor.insertContent(CENTERED_LOGO_TABLE),
                    });
                    editor.ui.registry.addButton('hisignature', {
                        text: 'אזור חתימות',
                        tooltip: 'הוסף טבלת חתימות (2 עמודות)',
                        onAction: () => editor.insertContent(SIGNATURE_TABLE),
                    });
                },
            }),
            [minHeight, onRequestAttachmentInsert, onRequestImageInsert],
        );

        return (
            <div className="proposal-template-tinymce rounded-lg border border-border-default bg-white [&_.tox-tinymce]:rounded-lg">
                <Editor
                    key={editorKey}
                    licenseKey="gpl"
                    value={value}
                    onInit={(_evt, editor) => {
                        editorRef.current = editor;
                    }}
                    onEditorChange={(content) => onChange(content)}
                    init={init}
                />
            </div>
        );
    },
);

ProposalTemplateTinyMceEditor.displayName = 'ProposalTemplateTinyMceEditor';

export default ProposalTemplateTinyMceEditor;
