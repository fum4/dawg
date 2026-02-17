# This document outlines quick wins or bug fixes

- Remove colored border from setup screen integration cards

- I connected to linear through the setup screen and the Issues tab did not show up in the workspace until i visited Integrations page (integrations loaded up) and then go back to workspace and refresh. this is the first issue, we should load everything from all pages in the background when app initializes, should not wait to visit corresponding pages. and second of all, the Issues tab should appear even if no jira/linear integration is setup, as users can create local issues without any integration

- When the "found x mcps and y skills on this device" banner is displayed on the agents page, if we click on "Import" the dialog should display the page with the list of skills/mcps/etc in order for us to check them and import, no need to display the "where to scan" page.

- All hooks should also be able to run "prompts" besides "skills" and "commands", which is a prompt that will be served to the agent to interpret and do whatever is mentioned there. add new "Add" buttons for all types of hooks, except for custom hooks, where we should provide user an extra input for the prompt. if the prompt input is filled user should be able to save the hook (same as with commands or skills). On-demand hooks should not have this functionality

- Use chain icon for "Add integrations" button on workspace screen

- Fix Linear attachments (they are not rendered)

- Remove "System" notifications from notifications popup

- Update jira icon in workspace add menu popover (we still use the broken version, update everywhere is needed)

- When hovering the "refresh" button from issues sidebar, add backgrund to it, and do not show hover effect on issue header

- Swap disconnect icon from integrations page cards with logout icon

- Having commits/push/pr disabled will not 100% stop claude from commiting (especially commits) -- should enforce the constraint (reproduced this only when using /work skill directly)

- Add loading animation to commit / push / pr buttons from worktree view

- Add view PR button that redirects to github when PR is opened (both worktree and issue view)

- Update notifications:
  - If we click on notifications button while notifications are open (or on anywhere outside the popup) we should close the popup
  - Make sure notifications are listed in chronological order (most recent first) - no matter the notification type
  - In notificatiosn list, there should be a top section, differentiated from the rest of the notifications, dedicated specifically to agents that require user action. If an agent requires user input it should notify our server and we should display a notification for this
  - Make it obvious in notifications title what kind of hooks we are talking about (pre-implementation, post-implementation, etc.)
  - Use the hook icon for hook-related notifications, not the agent icon
  - Add checkboxes / X icons (plain, no circle), loading circle to success / failed / in progress hooks/skills/commands in notifications list

- Agents should always ask, after considering a task is done, if post implementation hooks should be run. It should provide the user with two options -- yes, or no + custom message (what to do next?) -- if user chooses no, and asks the agent to continue working, the agent will ask again about post-implementation hooks after finishing the work again, and so on...

- Get rid of the separate, persistent "notification" overlay presented when running hooks (the yellow-brownish one); there should only be ONE notification in the notifications list that can be expanded inline and show all skills/commands that are part of the hook and their live status (running, completed, failed). Make this look pretty. we can make the notifications overlay bigger, if you see fit

- While skills / commands are running show their cards without bg and dashed border, just like their initial style (in worktree > hooks tab)

- Swap X with circle icon with simple X in worktree > hooks tab for failed hooks

- Pre-implementation hooks are NOT run -- fix this
- Custom hooks do not seem to work reliable, these also don't seem to be called -- fix this (e.g. i have a custom hook called "run after analysis" with the description "run this hook after you grasp what you need to do for this task. output what you understood needs to be done", i would expect this to be run by agents after they understand what needs to be done -- was not fired)

- It looks like the agent will fix issues reported by the code review skill if used as a hook. thats good, but lets make sure we actually instruct agents to do this, it should be reliable

- Fix bug where you cannot remove skills from hooks (post-implementation) - they reappear after being removed? - not sure about this, should be carefully verified
