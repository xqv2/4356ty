'use client';

import { useRef, type ChangeEvent, type MouseEvent } from 'react';

export interface PdfButtonProps {
  attached: boolean;
  onUpload: (file: File) => void;
  onView?: () => void;
}

export default function PdfButton({ attached, onUpload, onView }: PdfButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (attached && onView) {
      onView();
      return;
    }
    inputRef.current?.click();
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    // Reset so re-selecting the same file fires onChange again.
    e.target.value = '';
  };

  return (
    <>
      <button
        type="button"
        className={attached ? 'pdf-btn attached' : 'pdf-btn'}
        title={attached ? 'PDF attached' : 'Attach PDF'}
        aria-label={attached ? 'View attached PDF' : 'Attach PDF'}
        aria-pressed={attached}
        onClick={handleClick}
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
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={handleChange}
      />
    </>
  );
}
