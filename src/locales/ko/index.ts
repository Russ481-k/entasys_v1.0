import 'dayjs/locale/ko';
import zod from 'zod-i18n-map/locales/ko/zod.json';

import account from './account.json';
import admin from './admin.json';
import adminDashboard from './adminDashboard.json';
import app from './app.json';
import appHome from './appHome.json';
import auth from './auth.json';
import common from './common.json';
import components from './components.json';
import database from './database.json';
import domains from './domains.json';
import emails from './emails.json';
import management from './management.json';
import menus from './menus.json';
import users from './users.json';

export default {
  account,
  admin,
  adminDashboard,
  app,
  appHome,
  auth,
  database,
  common,
  components,
  domains,
  emails,
  management,
  menus,
  users,
  zod,
} as const;
