# Claude Code Mobile Notifications Setup

Get notified on your phone when Claude Code needs attention or finishes a task.

## Step 1: Set Up ntfy (Free Push Notification Service)

1. **Install the ntfy app on your phone:**
   - iOS: [App Store](https://apps.apple.com/app/ntfy/id1625396347)
   - Android: [Google Play](https://play.google.com/store/apps/details?id=io.heckel.ntfy)

2. **Subscribe to your topic:**
   - Open the app
   - Tap "+" to add a subscription
   - Enter a unique topic name (e.g., `claude-code-cliff-12345`)
   - Use something random/unique - anyone who knows the topic name can send to it

## Step 2: Test It Works

Run this in your terminal (replace with your topic name):

```bash
curl -d "Test notification from Claude Code" ntfy.sh/claude-code-cliff-12345
```

You should receive a push notification on your phone.

## Step 3: Configure Claude Code Hooks

Add the following to your Claude Code settings file.

**File location:** `~/.claude/settings.json` (usually `C:\Users\<username>\.claude\settings.json` on Windows)

If the file doesn't exist, create it. If it exists, merge the `hooks` section with any existing settings.

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -d \"Claude Code needs your attention\" ntfy.sh/YOUR-TOPIC-NAME"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -d \"Claude Code finished\" ntfy.sh/YOUR-TOPIC-NAME"
          }
        ]
      }
    ]
  }
}
```

**Important:** Replace `YOUR-TOPIC-NAME` with your actual topic name (e.g., `claude-code-cliff-12345`).

## Step 4: Restart Claude Code

Close and reopen Claude Code for the hooks to take effect.

## What Each Hook Does

| Hook | Triggers When |
|------|---------------|
| `Notification` | Claude needs permission to run a command, edit a file, etc. |
| `Stop` | Claude finishes responding (task complete or waiting for input) |

## Optional: Add More Context

If you want richer notifications with titles:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -H \"Title: Permission Needed\" -H \"Priority: high\" -H \"Tags: warning\" -d \"Claude Code is waiting for your approval\" ntfy.sh/YOUR-TOPIC-NAME"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -H \"Title: Task Complete\" -H \"Tags: white_check_mark\" -d \"Claude Code has finished\" ntfy.sh/YOUR-TOPIC-NAME"
          }
        ]
      }
    ]
  }
}
```

## Troubleshooting

- **Not receiving notifications?** Make sure your topic name matches exactly in both the app and the config
- **curl not found?** On Windows, use Git Bash or install curl, or use `Invoke-WebRequest` in PowerShell
- **Hooks not firing?** Run `/hooks` in Claude Code to verify your configuration is loaded
