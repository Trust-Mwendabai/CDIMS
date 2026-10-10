# CDIMS login details

Keep this file private. It is blocked from web access by `.htaccess`, but do not commit it to version control or send it to others.

## Application

- URL: http://localhost/CDIMS/
- Sign-in page: http://localhost/CDIMS/login

| Account | Username | Email | Password | Role |
| --- | --- | --- | --- | --- |
| Administrator | `admin` | admin@cdims.zm | `1cqEI2zr8DQQ9!` | admin |

If you have changed the admin password under **My account**, update the table above (or delete this file).

### Demo accounts (development only)

All demo accounts share the password `njaWnWE1CjnD7!`.

| Username | Email | Role | Can do |
| --- | --- | --- | --- |
| `demo.analyst` | demo.analyst@cdims.zm | analyst | dashboard, analysis, browse and export data, add and import data |
| `demo.analyst2` | demo.analyst2@cdims.zm | analyst | same as above |
| `demo.agriculture` | demo.agriculture@cdims.zm | stakeholder | dashboard, analysis, browse and export data |
| `demo.water` | demo.water@cdims.zm | stakeholder | same as above |
| `demo.public` | demo.public@cdims.zm | public | dashboard, stations and analysis only |

Delete these accounts on the **Users** page (disable them) before using real data. Create more with `php setup.php --demo-users` (skips existing ones) or on the **Users** page.

## Getting other accounts

1. Open http://localhost/CDIMS/register and create an account. New accounts start with the `public` role (read-only).
2. Sign in as `admin`, open **Users**, and set the role: `analyst` can add and import data; `stakeholder` and `public` are read-only.

## Database (XAMPP defaults)

| Setting | Value |
| --- | --- |
| Host | localhost |
| Database | `cdims_db` |
| User | `root` |
| Password | (empty) |

phpMyAdmin: http://localhost/phpmyadmin/

## If you are locked out

- **Too many failed logins:** wait 15 minutes, or clear the lockout:
  `C:\xampp\mysql\bin\mysql.exe -u root cdims_db -e "DELETE FROM login_attempts"`
- **Forgot the admin password:** run this from `C:\xampp\htdocs\CDIMS` to set a new one (replace `NewPassw0rd!`):
  `C:\xampp\php\php.exe -r "require 'config/config.php'; getDBConnection()->prepare('UPDATE users SET password_hash=? WHERE username=\'admin\'')->execute([password_hash('NewPassw0rd!', PASSWORD_BCRYPT)]);"`

## Before using this with real data

Change the admin password, and set the database `root` password in MySQL and in `CDIMS_DB_PASS`. A passwordless `root` account is acceptable only on a local development machine.
