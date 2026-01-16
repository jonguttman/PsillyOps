'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        p-1.5 rounded transition-colors
        ${isActive
          ? 'bg-gray-200 text-gray-900'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const isDisabled = disabled || !editor;

  return (
    <div className="flex items-center gap-0.5 p-2 border-b border-gray-200 bg-gray-50 rounded-t-md">
      {/* Bold */}
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBold().run()}
        isActive={editor?.isActive('bold') ?? false}
        disabled={isDisabled}
        title="Bold (Cmd+B)"
      >
        <span className="font-bold text-sm w-4 h-4 flex items-center justify-center">B</span>
      </ToolbarButton>

      {/* Italic */}
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        isActive={editor?.isActive('italic') ?? false}
        disabled={isDisabled}
        title="Italic (Cmd+I)"
      >
        <span className="italic text-sm w-4 h-4 flex items-center justify-center">I</span>
      </ToolbarButton>

      {/* Underline */}
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        isActive={editor?.isActive('underline') ?? false}
        disabled={isDisabled}
        title="Underline (Cmd+U)"
      >
        <span className="underline text-sm w-4 h-4 flex items-center justify-center">U</span>
      </ToolbarButton>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Bullet List */}
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        isActive={editor?.isActive('bulletList') ?? false}
        disabled={isDisabled}
        title="Bullet List"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <line x1="9" y1="6" x2="20" y2="6" />
          <line x1="9" y1="12" x2="20" y2="12" />
          <line x1="9" y1="18" x2="20" y2="18" />
          <circle cx="5" cy="6" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="5" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </ToolbarButton>
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
  className = '',
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable features we don't need
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        code: false,
      }),
      Underline,
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false, // Prevent SSR hydration mismatch
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Return empty string if only contains empty paragraph
      if (html === '<p></p>') {
        onChange('');
      } else {
        onChange(html);
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[80px] p-3',
      },
    },
  });

  // Update editor content when value changes externally
  // This handles cases like form reset
  if (editor && value !== editor.getHTML() && value !== '' && editor.getHTML() === '<p></p>') {
    editor.commands.setContent(value);
  }

  return (
    <div className={`border border-gray-300 rounded-md shadow-sm overflow-hidden ${disabled ? 'bg-gray-50' : 'bg-white'} ${className}`}>
      <Toolbar editor={editor} disabled={disabled} />
      <div className="relative">
        <EditorContent editor={editor} />
        {editor && editor.isEmpty && placeholder && (
          <div className="absolute top-3 left-3 text-gray-400 pointer-events-none text-sm">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
