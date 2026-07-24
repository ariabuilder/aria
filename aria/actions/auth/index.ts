/**
 * Auth action compatibility index. Concern-specific implementations live beside this file.
 */

import {
  checkSetupRequired,
  getAuthMethodAvailability,
  createFirstAdmin,
} from "./setup";
import {
  beginPasskeySetup,
  completePasskeySetup,
  passkeyLoginOptions,
  passkeyLoginVerify,
  listUserPasskeys,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  renameUserPasskey,
  removeUserPasskey,
} from "./passkeys";
import { login, logout, getMe, updatePreferences } from "./session";
import {
  requestPasswordReset,
  confirmPasswordReset,
  changePassword,
} from "./passwords";
import {
  initTotp,
  enableTotp,
  disableTotp,
  regenerateBackupCodes,
  adminInitTotp,
  adminEnableTotp,
  adminDisableTotp,
  adminRegenerateBackupCodes,
} from "./totp";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  uploadAvatar,
  removeAvatar,
} from "./users";
import {
  updateCaptchaConfig,
  getCaptchaConfig,
  getLoginCaptchaConfig,
  createTurnstileWidget,
} from "./captcha";
import {
  getAuthMethodsConfigAction,
  updateAuthMethodsConfig,
} from "./configuration";
import { getTwoFactorPolicy, updateTwoFactorPolicy } from "./policy";

export {
  checkSetupRequired,
  getAuthMethodAvailability,
  createFirstAdmin,
  beginPasskeySetup,
  completePasskeySetup,
  passkeyLoginOptions,
  passkeyLoginVerify,
  listUserPasskeys,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  renameUserPasskey,
  removeUserPasskey,
  login,
  logout,
  getMe,
  updatePreferences,
  requestPasswordReset,
  confirmPasswordReset,
  changePassword,
  initTotp,
  enableTotp,
  disableTotp,
  regenerateBackupCodes,
  adminInitTotp,
  adminEnableTotp,
  adminDisableTotp,
  adminRegenerateBackupCodes,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  uploadAvatar,
  removeAvatar,
  updateCaptchaConfig,
  getCaptchaConfig,
  getLoginCaptchaConfig,
  createTurnstileWidget,
  getAuthMethodsConfigAction,
  updateAuthMethodsConfig,
  getTwoFactorPolicy,
  updateTwoFactorPolicy,
};

export const auth = {
  checkSetupRequired,
  getAuthMethodAvailability,
  createFirstAdmin,
  beginPasskeySetup,
  completePasskeySetup,
  passkeyLoginOptions,
  passkeyLoginVerify,
  listUserPasskeys,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  renameUserPasskey,
  removeUserPasskey,
  getLoginCaptchaConfig,
  login,
  logout,
  requestPasswordReset,
  confirmPasswordReset,

  getMe,
  updatePreferences,
  changePassword,
  initTotp,
  enableTotp,
  disableTotp,
  regenerateBackupCodes,

  listUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  updateCaptchaConfig,
  getCaptchaConfig,
  createTurnstileWidget,
  getAuthMethodsConfigAction,
  updateAuthMethodsConfig,

  getTwoFactorPolicy,
  updateTwoFactorPolicy,

  adminInitTotp,
  adminEnableTotp,
  adminDisableTotp,
  adminRegenerateBackupCodes,

  uploadAvatar,
  removeAvatar,
};
