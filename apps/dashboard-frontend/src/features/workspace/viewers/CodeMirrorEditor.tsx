/**
 * CodeMirrorEditor — dünner, wiederverwendbarer CodeMirror-6-Wrapper (Plan 013,
 * B10). Eine Stelle für Sprache + Theme + Grundoptionen, damit Code-Viewer und
 * HTML-Code-Ansicht identisch aussehen („einheitlich").
 *
 * Theme-bewusst: Schwarz/Dunkel → One-Dark, Hell → CodeMirror-Default. So passt
 * die farbige Code-Ansicht immer zum Dashboard-Thema.
 */
import { useMemo } from 'react';
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from '@/hooks/useTheme';
import { spracheFuer } from './codeLanguage';

/** Zeilenumbruch an, damit lange Zeilen nicht horizontal aus dem Tab laufen. */
const BASIS: Extension[] = [EditorView.lineWrapping];

export default function CodeMirrorEditor({
  value,
  onChange,
  fileExtension,
  readOnly = false,
  ariaLabel,
  testId,
}: {
  value: string;
  onChange?: (next: string) => void;
  fileExtension: string;
  readOnly?: boolean;
  ariaLabel?: string;
  testId?: string;
}) {
  const { theme } = useTheme();
  const dunkel = theme === 'black' || theme === 'dark';

  const extensions = useMemo(() => [...BASIS, ...spracheFuer(fileExtension)], [fileExtension]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      editable={!readOnly}
      theme={dunkel ? oneDark : 'light'}
      extensions={extensions}
      height="100%"
      className="h-full text-[13px]"
      aria-label={ariaLabel}
      data-testid={testId}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: !readOnly,
        autocompletion: false,
      }}
    />
  );
}
