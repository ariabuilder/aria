import { describe, expect, it } from "vitest";
import * as authActions from "../../actions/auth/index";

const actionNames = [
  "checkSetupRequired",
  "getAuthMethodAvailability",
  "createFirstAdmin",
  "beginPasskeySetup",
  "completePasskeySetup",
  "passkeyLoginOptions",
  "passkeyLoginVerify",
  "listUserPasskeys",
  "passkeyRegisterOptions",
  "passkeyRegisterVerify",
  "renameUserPasskey",
  "removeUserPasskey",
  "getLoginCaptchaConfig",
  "login",
  "logout",
  "requestPasswordReset",
  "confirmPasswordReset",
  "getMe",
  "updatePreferences",
  "changePassword",
  "initTotp",
  "enableTotp",
  "disableTotp",
  "regenerateBackupCodes",
  "listUsers",
  "createUser",
  "updateUser",
  "deleteUser",
  "resetUserPassword",
  "updateCaptchaConfig",
  "getCaptchaConfig",
  "createTurnstileWidget",
  "getAuthMethodsConfigAction",
  "updateAuthMethodsConfig",
  "getTwoFactorPolicy",
  "updateTwoFactorPolicy",
  "adminInitTotp",
  "adminEnableTotp",
  "adminDisableTotp",
  "adminRegenerateBackupCodes",
  "uploadAvatar",
  "removeAvatar",
] as const;

describe("auth action compatibility index", () => {
  it("keeps the namespace and named exports aligned", () => {
    expect(Object.keys(authActions.auth)).toEqual(actionNames);

    for (const name of actionNames) {
      expect(authActions[name]).toBe(authActions.auth[name]);
    }
  });
});
