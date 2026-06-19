'use client';

import { useRef, type ChangeEvent } from 'react';

export interface PdfButtonProps {
  attached: boolean;
  onUpload: (file: File) => void;
  onView?: () => void;
}

export default function PdfButton({ attached, onUpload, onView }: PdfButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = '';
  };

  return (
    <div className="pdf-btn-wrap">
      <button
        type="button"
        className={attached ? 'pdf-btn attached' : 'pdf-btn'}
        title={attached ? 'File attached' : 'Attach file'}
        aria-label={attached ? 'View attached file' : 'Attach file'}
        aria-pressed={attached}
        onClick={attached && onView ? onView : undefined}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.99 8.84L9.41 17.41a2 2 0 0 1-2.83-2.83l7.07-7.07" />
        </svg>
      </button>

      {/* Overlay the file input directly over the button so iOS Safari receives
          a real touch on the input — programmatic .click() on display:none inputs
          is silently ignored by iOS Safari. Hidden when a file is already attached. */}
      {!attached && (
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg,image/webp,.webp"
          onChange={handleChange}
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            cursor: 'pointer',
            fontSize: '16px',
          }}
        />
      )}
    </div>
  );
}
