# Chat commands

[README](../README.md) · [Configuration](configuration.md)

Commands are case-insensitive.
Most commands work in both Discord and Twitch chat.
Unknown commands receive no response.

## Command reference

| Command | Access | Behavior |
| --- | --- | --- |
| `!goal` | Everyone; both platforms | Show the participant's total, goal, and percentage |
| `!promote` | Admin; both platforms | Move all members from the waiting voice room into the live voice room |
| `!testlights` | Admin; both platforms | Test the Hue donation celebration |
| `!color <value>` | Everyone; both platforms | Change the configured Hue group's color |
| `!sa status` | Twitch admin | Show campaign progress, companion connectivity, and recovery status |
| `!sa campaign recover confirm` | Twitch admin | Restore the validated campaign backup and silently establish current baselines |
| `!sa campaign reset confirm` | Twitch admin | Archive and reset campaign progress, then silently establish current baselines |
| `!sa game recover confirm` | Twitch admin; recent offline observation required | Restore the validated game-state backup |
| `!sa game reset confirm` | Twitch admin; recent offline observation required | Archive and reset game state |

For `!promote`, the Discord bot needs access to both voice rooms and permission to move members.
For Stream Avatars recovery details, see [state recovery](stream-avatars-setup.md#state-and-recovery).

## Administrator access

Set the platform's admin list in `.env`:

```dotenv
DISCORD_ADMIN_USERS=123456789012345678,987654321098765432
TWITCH_ADMIN_USERS=your_username,another_admin
```

Discord entries are user IDs; Twitch entries are login names.
An empty list grants no admin-command access.
Discord roles and Twitch badges do not grant access automatically.
Stream Avatars controls require the configured Twitch channel; forwarded, duplicate, or expired messages are refused.

## Hue colors and parties

All users can control the configured Hue group through `!color`.

| Example | Effect |
| --- | --- |
| `!color lightblue` | Apply a CSS named color |
| `!color #112233` | Apply a six-digit hexadecimal color |
| `!color random` | Apply a random color |
| `!color party` | Change colors once per second for 15 seconds, then restore the previous light states |

Short hexadecimal values, alpha values, and CSS functions are unsupported.
Normal color changes preserve each light's on/off state and remain until another change.
Successful normal changes receive no chat response; parties receive an acknowledgement.

Both platforms share one normal change per second and one party per minute for the entire group.
Busy requests receive a response and are not queued.
Donation celebrations and `!testlights` cancel active parties.
After the celebration, the controller restores the original pre-party light states.

A party needs a saved state for every light before it starts.
Restoration includes each light's on/off state, brightness, and color.
Shutdown cancels effects and attempts restoration after pending light writes.
The bot logs bridge and restoration failures.

## Custom commands

Set `CUSTOM_RESPONSES` to comma-separated command and response pairs:

```dotenv
CUSTOM_RESPONSES=donate:"Donate at https://donate.example.com",discord:"Join https://discord.gg/example"
```

Custom commands work on both platforms and are available to everyone.
Command names start with a letter and contain only letters and numbers.
The parser converts names to lowercase.
Duplicate names prevent startup.
Quoted responses can contain commas.

The parser reserves `goal`, `promote`, `color`, and `sa`.
The command handler also owns `testlights`; a custom response with that name cannot run.
Choose another name for a custom command.
The `color` and `sa` names are reserved for built-in commands.
