/**
 * UserManagement — Phase 1.1
 *
 * Admin-UI: Mitarbeiter anlegen, Rollen vergeben, Konten deaktivieren,
 * Passwörter zurücksetzen. Kanzlei-Setup mit 5+ Mitarbeitern braucht das.
 *
 * Sichtbar nur für Admin-Rolle (Backend-Endpoints sind requireAdmin).
 */

import { useEffect, useState } from 'react';
import { Loader2, UserPlus, Users, Trash2, KeyRound, Shield, ShieldOff } from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';

type UserRole = 'admin' | 'member' | 'readonly';

interface UserRow {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  member: 'Mitarbeiter',
  readonly: 'Lesezugriff',
};

export function UserManagement() {
  const api = useApi();
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    role: 'member' as UserRole,
  });

  const refresh = async () => {
    try {
      const data = await api.get<{ users: UserRow[] }>('/admin/users');
      setUsers(data.users);
    } catch {
      toast.error('Benutzerliste konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createUser = async () => {
    if (!newUser.username || !newUser.email || !newUser.password) {
      toast.warning('Bitte alle Felder ausfüllen');
      return;
    }
    setBusy('create');
    try {
      const res = await api.post<{ user: UserRow }>('/admin/users', newUser);
      setUsers(prev => [...prev, res.user]);
      setNewUser({ username: '', email: '', password: '', role: 'member' });
      toast.success(`Benutzer ${res.user.username} angelegt`);
    } catch (err) {
      const e = err as { message?: string };
      toast.error(e.message || 'Fehler beim Anlegen');
    } finally {
      setBusy(null);
    }
  };

  const updateRole = async (user: UserRow, role: UserRole) => {
    setBusy(`role-${user.id}`);
    try {
      const res = await api.patch<{ user: UserRow }>(`/admin/users/${user.id}`, { role });
      setUsers(prev => prev.map(u => (u.id === user.id ? res.user : u)));
      toast.success(`Rolle von ${user.username} auf ${ROLE_LABELS[role]} gesetzt`);
    } catch (err) {
      const e = err as { message?: string };
      toast.error(e.message || 'Fehler beim Ändern der Rolle');
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = async (user: UserRow) => {
    if (
      user.is_active &&
      !window.confirm(
        `Benutzer "${user.username}" deaktivieren? Bestehende Sessions bleiben aktiv bis Token-Ablauf.`
      )
    ) {
      return;
    }
    setBusy(`active-${user.id}`);
    try {
      const res = await api.patch<{ user: UserRow }>(`/admin/users/${user.id}`, {
        is_active: !user.is_active,
      });
      setUsers(prev => prev.map(u => (u.id === user.id ? res.user : u)));
      toast.success(`${user.username} ${res.user.is_active ? 'aktiviert' : 'deaktiviert'}`);
    } catch (err) {
      const e = err as { message?: string };
      toast.error(e.message || 'Fehler beim Ändern des Status');
    } finally {
      setBusy(null);
    }
  };

  const resetPassword = async (user: UserRow) => {
    const newPw = window.prompt(`Neues Passwort für ${user.username} (mind. 12 Zeichen):`);
    if (!newPw) return;
    setBusy(`reset-${user.id}`);
    try {
      await api.post(`/admin/users/${user.id}/reset-password`, { password: newPw });
      toast.success(`Passwort von ${user.username} zurückgesetzt`);
    } catch (err) {
      const e = err as { message?: string };
      toast.error(e.message || 'Fehler beim Zurücksetzen');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Lädt Benutzer...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <header className="flex items-center gap-3">
        <Users className="size-7 text-primary" />
        <div>
          <h2 className="text-xl font-semibold text-foreground m-0">Benutzerverwaltung</h2>
          <p className="text-sm text-muted-foreground m-0">
            Mitarbeiter anlegen, Rollen vergeben, Zugang verwalten.
          </p>
        </div>
      </header>

      {/* Create new user */}
      <section className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <UserPlus className="size-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground m-0">Neuen Benutzer anlegen</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="new-username">Benutzername *</Label>
            <Input
              id="new-username"
              value={newUser.username}
              onChange={e => setNewUser(prev => ({ ...prev, username: e.target.value }))}
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="new-email">E-Mail *</Label>
            <Input
              id="new-email"
              type="email"
              value={newUser.email}
              onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="new-password">Passwort *</Label>
            <Input
              id="new-password"
              type="password"
              value={newUser.password}
              onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="new-role">Rolle</Label>
            <Select
              value={newUser.role}
              onValueChange={v => setNewUser(prev => ({ ...prev, role: v as UserRole }))}
            >
              <SelectTrigger id="new-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['member', 'readonly', 'admin'] as UserRole[]).map(r => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button disabled={busy === 'create'} onClick={createUser}>
            {busy === 'create' && <Loader2 className="size-4 animate-spin" />}
            Anlegen
          </Button>
        </div>
      </section>

      {/* User list */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Benutzer</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">E-Mail</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rolle</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium text-foreground">{u.username}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <Select
                    value={u.role}
                    onValueChange={(v: string) => updateRole(u, v as UserRole)}
                    disabled={busy === `role-${u.id}`}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['member', 'readonly', 'admin'] as UserRole[]).map(r => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-3">
                  {u.is_active ? (
                    <span className="inline-flex items-center gap-1 text-success text-xs">
                      <Shield className="size-3.5" /> Aktiv
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                      <ShieldOff className="size-3.5" /> Deaktiviert
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Passwort zurücksetzen"
                      onClick={() => resetPassword(u)}
                      disabled={busy === `reset-${u.id}`}
                    >
                      {busy === `reset-${u.id}` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <KeyRound className="size-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title={u.is_active ? 'Deaktivieren' : 'Aktivieren'}
                      onClick={() => toggleActive(u)}
                      disabled={busy === `active-${u.id}`}
                    >
                      {busy === `active-${u.id}` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : u.is_active ? (
                        <Trash2 className="size-4" />
                      ) : (
                        <Shield className="size-4" />
                      )}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default UserManagement;
