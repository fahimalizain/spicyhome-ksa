import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminRowEnabledCheckbox } from '../pages/admin/AdminRowEnabledCheckbox';

describe('AdminRowEnabledCheckbox', () => {
  it('renders a checkbox with the aria-label, reflecting the checked prop', () => {
    const { rerender } = render(
      <AdminRowEnabledCheckbox
        checked={true}
        ariaLabel="Disable Zinger Burger"
        onToggle={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Disable Zinger Burger' });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toBeChecked();

    rerender(
      <AdminRowEnabledCheckbox checked={false} ariaLabel="Enable Pepperoni" onToggle={vi.fn()} />,
    );
    expect(screen.getByRole('checkbox', { name: 'Enable Pepperoni' })).not.toBeChecked();
  });

  it('calls onToggle once when clicked', () => {
    const onToggle = vi.fn();
    render(
      <AdminRowEnabledCheckbox checked={false} ariaLabel="Enable Pepperoni" onToggle={onToggle} />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable Pepperoni' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('does not bubble the click to a parent onClick handler', () => {
    const onToggle = vi.fn();
    const parentSpy = vi.fn();
    render(
      <div onClick={parentSpy}>
        <AdminRowEnabledCheckbox
          checked={true}
          ariaLabel="Disable Zinger Burger"
          onToggle={onToggle}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disable Zinger Burger' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(parentSpy).not.toHaveBeenCalled();
  });

  it('renders disabled and does not call onToggle when clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <AdminRowEnabledCheckbox
        checked={true}
        disabled={true}
        ariaLabel="Disable Zinger Burger"
        onToggle={onToggle}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Disable Zinger Burger' });
    expect(checkbox).toBeDisabled();

    await user.click(checkbox);

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('passes title through to the wrapper for tooltips', () => {
    render(
      <AdminRowEnabledCheckbox
        checked={true}
        ariaLabel="Disable Zinger Burger"
        title="Locked row"
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByTitle('Locked row')).toBeInTheDocument();
  });
});
