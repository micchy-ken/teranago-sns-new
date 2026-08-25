import { User } from '../types';

/**
 * Triggers the global user detail modal from anywhere in the application
 */
export function triggerOpenUserModal(user: User | string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('teranago:open-user-modal', { detail: user }));
  }
}
