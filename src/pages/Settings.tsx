import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { RoleBadge } from "@/components/shared/StatusBadge";
import { AvatarPickerModal } from "@/components/settings/AvatarPickerModal";
import { PersonalInformationPanel } from "@/components/settings/PersonalInformationPanel";
import { writeProfilePrefs } from "@/lib/profile-prefs";
import { motion } from "framer-motion";
import { User, Building2, BellRing, Camera, Check, Loader2, IdCard } from "lucide-react";

const TABS = [
  { key: "profile", label: "Profile", icon: User },
  { key: "personal", label: "Personal information", icon: IdCard },
  { key: "workspace", label: "Workspace", icon: Building2 },
  { key: "notifications", label: "Notifications", icon: BellRing },
];

const WORKSPACE_KEY = "settings-workspace";
const NOTIFICATIONS_KEY = "settings-notifications";

type ProfileForm = {
  name: string;
  avatar: string | null;
};

type WorkspaceForm = {
  workspaceName: string;
  startTime: string;
  endTime: string;
  timezone: string;
};

type NotificationPrefs = Record<string, boolean>;

const WORKSPACE_TIMEZONE = "Asia/Kolkata";
const WORKSPACE_TIMEZONE_LABEL = "Mumbai (IST)";

const DEFAULT_WORKSPACE: WorkspaceForm = {
  workspaceName: "Aumento Track",
  startTime: "09:00",
  endTime: "21:00",
  timezone: WORKSPACE_TIMEZONE,
};

const NOTIFICATION_ITEMS = [
  { key: "taskAssignments", label: "Task Assignments", desc: "When you are assigned to a new task", defaultChecked: true },
  { key: "statusChanges", label: "Status Changes", desc: "When a task you follow changes status", defaultChecked: true },
  { key: "mentions", label: "Mentions", desc: "When someone mentions you in a task", defaultChecked: true },
  { key: "dueDateReminders", label: "Due Date Reminders", desc: "24 hours before task due dates", defaultChecked: true },
  { key: "weeklySummary", label: "Weekly Summary", desc: "Weekly report of your activity", defaultChecked: false },
];

function readWorkspacePrefs(): WorkspaceForm {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    const parsed = raw ? { ...DEFAULT_WORKSPACE, ...JSON.parse(raw) } : DEFAULT_WORKSPACE;
    return { ...parsed, timezone: WORKSPACE_TIMEZONE };
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

function readNotificationPrefs(): NotificationPrefs {
  const defaults = Object.fromEntries(
    NOTIFICATION_ITEMS.map((item) => [item.key, item.defaultChecked]),
  );
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export default function Settings() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState("profile");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    name: "",
    avatar: null,
  });

  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceForm>(readWorkspacePrefs);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(readNotificationPrefs);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      name: user.name ?? "",
      avatar: user.avatar ?? null,
    });
  }, [user]);

  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: async (updatedUser) => {
      utils.auth.me.setData(undefined, updatedUser);
      writeProfilePrefs(updatedUser.id, {
        name: updatedUser.name,
        email: updatedUser.email,
        department: updatedUser.department,
        position: updatedUser.position,
        phone: updatedUser.phone,
      });

      await invalidateProfileViews(utils);

      setSaveError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (error) => {
      setSaveError(error.message || "Could not save changes.");
    },
  });

  const isSaving = updateProfileMutation.isPending;

  const handleAvatarSelect = (avatarUrl: string) => {
    setProfileForm((prev) => ({ ...prev, avatar: avatarUrl }));
    setAvatarPickerOpen(false);
    setSaveError(null);
    updateProfileMutation.mutate({ avatar: avatarUrl });
  };

  const handleSaveProfile = () => {
    setSaveError(null);
    if (!profileForm.name.trim()) {
      setSaveError("Name is required.");
      return;
    }

    updateProfileMutation.mutate({
      name: profileForm.name.trim(),
      avatar: profileForm.avatar,
    });
  };

  const handleSaveWorkspace = () => {
    localStorage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({ ...workspaceForm, timezone: WORKSPACE_TIMEZONE }),
    );
    setSaveError(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveNotifications = () => {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notificationPrefs));
    setSaveError(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSave = () => {
    if (activeTab === "profile") handleSaveProfile();
    else if (activeTab === "workspace") handleSaveWorkspace();
    else handleSaveNotifications();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1F2937]">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account and preferences</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex min-h-[500px]">
        <div className="w-56 border-r border-gray-200 bg-gray-50/50 flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSaveError(null);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-white text-[#2563EB] border-l-[3px] border-[#2563EB]"
                  : "text-gray-600 hover:bg-white/60 border-l-[3px] border-transparent"
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 p-6">
          {activeTab === "profile" && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <h2 className="text-lg font-semibold text-[#1F2937]">Profile Settings</h2>

              <div className="flex items-center gap-5">
                <UserAvatar name={profileForm.name || user?.name} avatar={profileForm.avatar} size={80} />
                <div>
                  <button
                    type="button"
                    onClick={() => setAvatarPickerOpen(true)}
                    className="h-9 px-4 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Camera size={14} /> Change Avatar
                  </button>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Choose a preset or upload an image. Your avatar is saved to your account immediately.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Contact details are managed under Personal information.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <div className="h-10 flex items-center">
                    <RoleBadge role={user?.role as "admin" | "manager" | "employee" || "employee"} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "personal" && (
            <PersonalInformationPanel
              onSaved={() => {
                setSaveError(null);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
              onError={setSaveError}
            />
          )}

          {activeTab === "workspace" && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <h2 className="text-lg font-semibold text-[#1F2937]">Workspace Settings</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Workspace Name</label>
                  <input
                    type="text"
                    value={workspaceForm.workspaceName}
                    onChange={(e) => setWorkspaceForm((prev) => ({ ...prev, workspaceName: e.target.value }))}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Working Hours</label>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="time"
                      value={workspaceForm.startTime}
                      onChange={(e) => setWorkspaceForm((prev) => ({ ...prev, startTime: e.target.value }))}
                      className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm"
                    />
                    <input
                      type="time"
                      value={workspaceForm.endTime}
                      onChange={(e) => setWorkspaceForm((prev) => ({ ...prev, endTime: e.target.value }))}
                      className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <input
                    type="text"
                    value={WORKSPACE_TIMEZONE_LABEL}
                    disabled
                    readOnly
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-600 cursor-not-allowed"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "notifications" && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
              <h2 className="text-lg font-semibold text-[#1F2937]">Notification Preferences</h2>

              <div className="space-y-4">
                {NOTIFICATION_ITEMS.map((item) => (
                  <label key={item.key} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={notificationPrefs[item.key] ?? item.defaultChecked}
                      onChange={(e) =>
                        setNotificationPrefs((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                      className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-800">{item.label}</div>
                      <div className="text-xs text-gray-400">{item.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </motion.div>
          )}

          {saveError && <p className="text-sm text-red-500">{saveError}</p>}

          {activeTab !== "personal" && (
          <div className="pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="h-10 px-6 bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-blue-200 transition-all flex items-center gap-2 disabled:opacity-60"
            >
              {isSaving ? (
                <><Loader2 size={16} className="animate-spin" /> Saving...</>
              ) : saved ? (
                <><Check size={16} /> Saved</>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
          )}
        </div>
      </div>

      <AvatarPickerModal
        open={avatarPickerOpen}
        name={profileForm.name || user?.name}
        currentAvatar={profileForm.avatar}
        onClose={() => setAvatarPickerOpen(false)}
        onSelect={handleAvatarSelect}
      />
    </motion.div>
  );
}

function invalidateProfileViews(utils: ReturnType<typeof trpc.useUtils>) {
  return Promise.all([
    utils.auth.getPersonalInfo.invalidate(),
    utils.user.listForPicker.invalidate(),
    utils.user.list.invalidate(),
    utils.project.list.invalidate(),
    utils.task.list.invalidate(),
    utils.task.getById.invalidate(),
    utils.dashboard.getStats.invalidate(),
    utils.timeEntry.getTeamHours.invalidate(),
  ]);
}
