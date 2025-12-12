interface ActivityItem {
  id: string;
  summary: string;
  createdAt: Date;
  user: { name: string } | null;
  tags: string[] | unknown;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h2>
        <p className="text-sm text-gray-500">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h2>
      <ul className="space-y-3">
        {activities.map((activity) => {
          const userName = activity.user?.name || 'System';
          const tags = Array.isArray(activity.tags) ? activity.tags : [];
          const isAiCommand = tags.includes('ai_command');
          const isSystem = !activity.user;

          return (
            <li key={activity.id} className="flex items-start gap-3">
              {/* Avatar */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                  isSystem
                    ? 'bg-gray-200 text-gray-600'
                    : isAiCommand
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {isSystem ? 'S' : userName.charAt(0).toUpperCase()}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 leading-snug">{activity.summary}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500">
                    {formatTimeAgo(new Date(activity.createdAt))}
                  </span>
                  {isAiCommand && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                      AI
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

