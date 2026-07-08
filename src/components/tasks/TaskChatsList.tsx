import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatTimeAgo } from "@/lib/utils";
import { MessageSquare, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export type TaskChatItem = {
  taskId: number;
  title: string;
  lastMessage: string;
  lastAt: Date;
  unread: boolean;
  assignee?: { name: string | null; avatar?: string | null } | null;
};

interface TaskChatsListProps {
  chats: TaskChatItem[];
  isLoading?: boolean;
  onTaskClick: (id: number) => void;
}

export function TaskChatsList({ chats, isLoading, onTaskClick }: TaskChatsListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl py-16 text-center">
        <MessageSquare size={36} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">No task conversations yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
      {chats.map((chat, i) => (
        <motion.button
          key={chat.taskId}
          type="button"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          onClick={() => onTaskClick(chat.taskId)}
          className="w-full flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
        >
          {chat.assignee ? (
            <UserAvatar name={chat.assignee.name} avatar={chat.assignee.avatar} size={40} />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <MessageSquare size={18} className="text-gray-400" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className={`text-sm truncate ${chat.unread ? "font-semibold text-[#1F2937]" : "font-medium text-gray-700"}`}>
                {chat.title}
              </span>
              <span className="text-xs text-gray-400 shrink-0">{formatTimeAgo(chat.lastAt)}</span>
            </div>
            <p className={`text-sm truncate ${chat.unread ? "text-gray-700" : "text-gray-500"}`}>
              {chat.lastMessage}
            </p>
          </div>

          {chat.unread && (
            <span className="w-2 h-2 rounded-full bg-[#E2352D] mt-2 shrink-0" />
          )}
        </motion.button>
      ))}
    </div>
  );
}
