declare module 'react-quill' {
  import * as React from 'react';

  export interface ReactQuillProps {
    value?: string;
    defaultValue?: string;
    onChange?: (content: string, delta: unknown, source: string, editor: unknown) => void;
    theme?: string;
    modules?: Record<string, unknown>;
    formats?: string[];
    className?: string;
    placeholder?: string;
    readOnly?: boolean;
  }

  const ReactQuill: React.ComponentType<ReactQuillProps>;
  export default ReactQuill;
}
