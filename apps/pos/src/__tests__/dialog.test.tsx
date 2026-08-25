import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from '../components/Dialog';
import type { DialogProps } from '../components/Dialog';

function renderDialog(props: Partial<DialogProps> = {}) {
  const onClose = vi.fn();
  const view = render(
    <Dialog
      title="Edit Item"
      onClose={onClose}
      footer={
        <button type="button" className="touch-target">
          Save
        </button>
      }
      {...props}
    >
      <label htmlFor="item-name">Item name</label>
      <input id="item-name" aria-label="Item name" />
    </Dialog>,
  );
  return { onClose, unmount: view.unmount };
}

describe('Dialog', () => {
  it('renders title, children, and footer content', () => {
    renderDialog();

    expect(screen.getByRole('heading', { name: 'Edit Item' })).toBeInTheDocument();
    expect(screen.getByLabelText('Item name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('backdrop click (the overlay .fixed.inset-0) calls onClose once', () => {
    const { onClose } = renderDialog();

    const backdrop = document.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeNull();

    // A real backdrop tap: the pointer goes down on the overlay, then the
    // click lands there too.
    fireEvent.pointerDown(backdrop as HTMLElement);
    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('OSK collapse click-through: press on footer Save, click on overlay — no close', () => {
    const { onClose } = renderDialog();

    const backdrop = document.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeNull();
    const saveButton = screen.getByRole('button', { name: 'Save' });

    // Docked OSK collapse moves the card, so a press that started on Save
    // delivers its click on the overlay (the common ancestor of down and up
    // targets). That phantom backdrop click must not close the dialog.
    fireEvent.pointerDown(saveButton);
    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('click inside the card (heading or body) does not call onClose', () => {
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('heading', { name: 'Edit Item' }));
    fireEvent.click(screen.getByLabelText('Item name'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape keydown on window calls onClose once', () => {
    const { onClose } = renderDialog();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('removes the Escape listener on unmount', () => {
    const { onClose, unmount } = renderDialog();

    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('card carries data-osk-scope, role=dialog and aria-labelledby pointing at the title heading', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-osk-scope');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const heading = screen.getByRole('heading', { name: 'Edit Item' });
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
  });

  it('renders the osk-dock with the default data-osk-size="md"', () => {
    renderDialog();

    expect(screen.getByTestId('osk-dock')).toHaveAttribute('data-osk-size', 'md');
  });

  it('forwards oskSize="sm" to the dock', () => {
    renderDialog({ oskSize: 'sm' });

    expect(screen.getByTestId('osk-dock')).toHaveAttribute('data-osk-size', 'sm');
  });

  it('applies className on the card, not the overlay, replacing the default width', () => {
    renderDialog({ className: 'w-[640px]' });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('w-[640px]');
    // The default width must not linger — only one width class, ever.
    expect(dialog).not.toHaveClass('w-[480px]');

    const overlay = document.querySelector('.fixed.inset-0');
    expect(overlay).not.toBeNull();
    expect(overlay).not.toHaveClass('w-[640px]');
  });

  it('defaults the card width to w-[480px] when no className is passed', () => {
    renderDialog();

    expect(screen.getByRole('dialog')).toHaveClass('w-[480px]');
  });

  it('keeps the footer a sibling of the scroll body, not a descendant of it', () => {
    renderDialog();

    const body = screen.getByTestId('dialog-body');
    const footer = screen.getByTestId('dialog-footer');

    expect(footer).toBeInTheDocument();
    expect(body.contains(footer)).toBe(false);
    // True siblings: both are direct children of the card.
    expect(footer.parentElement).toBe(screen.getByRole('dialog'));
    expect(body.parentElement).toBe(screen.getByRole('dialog'));
  });
});
