import {
  EN_AUTH_DOCUMENT_TITLE_MESSAGES,
  FR_AUTH_DOCUMENT_TITLE_MESSAGES,
} from "./authDocumentTitles";

export const EN_AUTH_MESSAGES = {
  ...EN_AUTH_DOCUMENT_TITLE_MESSAGES,
  "auth.login.heading":
    'Welcome back to <span class="text-primary">Aria</span>',
  "auth.login.tagline":
    "Pick up where you left off.",
  "auth.login.title": "Sign in",
  "auth.login.description": "Access your studio",
  "auth.setup.heading":
    'Secure your <span class="text-primary">Aria</span> studio',
  "auth.setup.tagline": "",
  "auth.setup.title": "Create account",
  "auth.setup.description": "Start with your first admin",
  "auth.signingIn": "Signing in...",
  "auth.signIn": "Sign in",
  "auth.checkingPasskey": "Checking passkey...",
  "auth.signInWithPasskey": "Sign in with passkey",
  "auth.signInAttention": "Sign-in needs attention",
  "auth.identifier": "Email or username",
  "auth.password": "Password",
  "auth.enterTotp": "Enter your two-factor authentication code",
  "auth.rememberMe": "Remember me",
  "auth.forgotPassword": "Forgot password?",
  "auth.verifyCode": "Verify code",
  "auth.setupAttention": "Setup needs attention",
  "auth.accountCreated": "Account created",
  "auth.openingStudio": "Opening the Studio...",
  "auth.back": "Back",
  "auth.continue": "Continue",
  "auth.creating": "Creating...",
  "auth.createAccount": "Create account",
  "auth.forgot.heading":
    'Reset your <span class="text-primary">Aria</span> access',
  "auth.forgot.tagline":
    "We will send a secure link to your inbox.<br />Use it once to choose a new password.",
  "auth.forgot.title": "Forgot password",
  "auth.forgot.description": "Enter the email tied to your account.",
  "auth.reset.heading":
    'Choose a new <span class="text-primary">Aria</span> password',
  "auth.reset.tagline":
    "Use the secure link from your email.<br />This page works once.",
  "auth.reset.title": "Reset password",
  "auth.reset.description": "Set a new password for your account.",
  "auth.email": "Email address",
  "auth.enterEmail": "Enter your email",
  "auth.backToSignIn": "Back to sign in",
  "auth.sending": "Sending...",
  "auth.sendResetLink": "Send reset link",
  "auth.resetRequestAttention": "Reset request needs attention",
  "auth.checkInbox": "Check your inbox",
  "auth.resetAttention": "Reset needs attention",
  "auth.passwordUpdated": "Password updated",
  "auth.resetting": "Resetting...",
  "auth.resetPassword": "Reset password",
  "auth.newPassword": "New password",
  "auth.confirmPassword": "Confirm password",
  "auth.enterNewPassword": "Enter new password",
  "auth.confirmNewPassword": "Confirm new password",
  "auth.minimumPasswordLength": "Minimum 7 characters.",
  "auth.passwordsDoNotMatch": "Passwords do not match.",
  "auth.togglePasswordVisibility": "Toggle password visibility",
  "auth.username": "Username",
  "auth.chooseUsername": "Choose a username",
  "auth.usernameHelp": "3-30 characters, starts with a letter.",
  "auth.emailRecoveryHelp":
    "Used for account recovery after email delivery is configured.",
  "auth.setupProgress": "Setup progress",
  "auth.step.account": "Account",
  "auth.step.passkey": "Passkey",
  "auth.step.recovery": "Recovery",
  "auth.recoveryPassword": "Recovery password",
  "auth.createRecoveryPassword": "Create a strong recovery password",
  "auth.confirmRecoveryPassword": "Confirm your recovery password",
  "auth.recovery.title": "Set a recovery password",
  "auth.recovery.description":
    "Your backup for signing in when a passkey is not available. Store it somewhere safe.",
  "auth.passkey.title": "Prepare secure sign-in",
  "auth.passkey.description":
    "Set up your passkey now for fast, device-based access. Your recovery password keeps your account secure.",
  "auth.usePasswordSetup": "Set up with password instead",
  "auth.passkey.unsupported.title": "Passkeys are almost ready",
  "auth.passkey.unsupported.description":
    "Finish setup today, then add device-based sign-in from security settings later.",
  "auth.passkey.insecure.title": "Secure sign-in needs HTTPS",
  "auth.passkey.insecure.description":
    "Finish setup now; device-based sign-in can be added once this workspace is served securely.",
  "auth.passkey.ready.title": "Your browser is ready",
  "auth.passkey.ready.description":
    "Device-based sign-in is next. Finish setup to open your Studio.",
  "auth.passkey.success.title": "Passkey created",
  "auth.passkey.success.description":
    "Continue to add the required recovery password.",
  "auth.passkey.error.title": "Passkey setup paused",
  "auth.passkey.error.description":
    "Finish setup now and add passkeys from security settings later.",
  "auth.passkey.pending.title": "Waiting for your device",
  "auth.passkey.pending.description":
    "Follow the browser prompt to create your passkey.",
  "auth.passkey.checking.title": "Checking this device",
  "auth.passkey.checking.description":
    "Aria is preparing the best sign-in path for this workspace.",
  "auth.passkey.backend.title": "Passkeys are coming next",
  "auth.passkey.backend.description":
    "Set your administrator account now; faster device-based sign-in will fit into this flow.",
  "auth.passkeyUnavailable":
    "Passkeys are not available in this browser context.",
  "auth.passkeySignInFailed": "Passkey sign-in failed",
  "auth.passkeySignInRetry":
    "Passkey sign-in failed. Try again or use password.",
  "auth.passkeySignInCancelled": "Passkey sign-in was cancelled.",
  "auth.invalidForm": "Invalid form data",
  "auth.enterSixDigitCode": "Please enter the 6-digit authentication code",
  "auth.passkeySetupStartFailed": "Failed to start passkey setup",
  "auth.passkeySetupCancelled":
    "Passkey setup was cancelled. Try again when you're ready.",
  "auth.passkeySetupRetry":
    "Passkey setup failed. Try again or use a supported browser.",
  "auth.createPasskeyFirst": "Create a passkey before setting recovery.",
  "auth.createAccountFailed": "Failed to create account",
  "auth.validEmailRequired": "A valid email address is required",
  "auth.resetLinkSent": "If that email exists, a reset link has been sent.",
  "auth.invalidResetRequest": "Invalid password reset request",
  "auth.passwordResetSuccess":
    "Password reset successfully! Redirecting to login...",
  "auth.passkeySupportChecking": "Checking passkey support...",
  "auth.passkeyUnsupported":
    "This browser does not support passkeys. Use password sign-in instead.",
  "auth.passkeyRequiresHttps": "Passkeys require HTTPS or localhost.",
  "auth.passkeyDisabled":
    "Passkey sign-in is disabled for this workspace. Use password sign-in.",
  "auth.passkeyAlternative":
    "Passkey sign-in failed. Try again or use another sign-in method.",
  "auth.hidePasswordSignIn": "Hide password sign-in",
  "auth.showPasswordSignIn": "Sign in with password",
  "auth.magicLinkUnavailable":
    "Magic-link sign-in needs configured outbound email and ships in Phase 2.",
  "auth.identifierRequired": "Enter your email or username.",
  "auth.passwordRequired": "Enter your password.",
  "auth.totpCodeInvalid": "Enter a 6-digit authentication code.",
  "auth.usernameTooShort": "Username must be at least 3 characters.",
  "auth.usernameTooLong": "Username must be at most 30 characters.",
  "auth.usernameInvalid":
    "Username must start with a letter and use only letters, numbers, and underscores.",
  "auth.captcha.loading": "Loading security verification. Please wait.",
  "auth.captcha.required": "Complete the security verification.",
  "auth.captcha.loadFailed":
    "Security verification failed to load. Refresh and try again.",
  "auth.captcha.failed": "Security verification failed. Try again.",
  "auth.captcha.expired":
    "Security verification expired. Complete it again.",
  "auth.captcha.timedOut":
    "Security verification timed out. Try again.",
  "auth.captcha.unavailable":
    "Unable to load security verification. Refresh and try again.",
  "auth.unexpectedError": "Something went wrong. Please try again.",
  "auth.loginFailed": "Unable to sign in. Check your details and try again.",
  "auth.invalidCredentials": "Email, username, or password is incorrect.",
  "auth.twoFactorRequired": "Enter your two-factor authentication code.",
  "auth.twoFactorSetupRequired":
    "Two-factor authentication is required for this account. Contact an administrator for help.",
  "auth.tooManyAttempts": "Too many attempts. Please try again later.",
  "auth.attemptsRemaining": "{{count}} attempts remaining.",
  "auth.setupAlreadyCompleted": "Setup is already complete. Sign in to continue.",
  "auth.passkeySetupExpired": "Passkey setup expired. Start setup again.",
} as const;

export type AuthMessageKey = keyof typeof EN_AUTH_MESSAGES;
export type AuthMessageCatalog = Record<AuthMessageKey, string>;

export const FR_AUTH_MESSAGES = {
  ...FR_AUTH_DOCUMENT_TITLE_MESSAGES,
  "auth.login.heading":
    'Bon retour dans <span class="text-primary">Aria</span>',
  "auth.login.tagline":
    "Reprenez la ou vous vous etes arrete.<br />Votre Studio est pret.",
  "auth.login.title": "Connexion",
  "auth.login.description": "Accedez à votre espace de travail.",
  "auth.setup.heading":
    'Securisez votre studio <span class="text-primary">Aria</span>',
  "auth.setup.tagline": "Commencez avec votre premier administrateur.",
  "auth.setup.title": "Premier administrateur",
  "auth.setup.description": "Créez les clés de votre Studio.",
  "auth.signingIn": "Connexion...",
  "auth.signIn": "Connexion",
  "auth.checkingPasskey": "Vérification de la clé d'accès...",
  "auth.signInWithPasskey": "Se connecter avec une clé d'accès",
  "auth.signInAttention": "La connexion requiert votre attention",
  "auth.identifier": "Courriel ou nom d'utilisateur",
  "auth.password": "Mot de passe",
  "auth.enterTotp": "Saisissez votre code d'authentification à deux facteurs",
  "auth.rememberMe": "Se souvenir de moi",
  "auth.forgotPassword": "Mot de passe oublie?",
  "auth.verifyCode": "Vérifier le code",
  "auth.setupAttention": "La configuration requiert votre attention",
  "auth.accountCreated": "Compte créé",
  "auth.openingStudio": "Ouverture du Studio...",
  "auth.back": "Retour",
  "auth.continue": "Continuer",
  "auth.creating": "Création...",
  "auth.createAccount": "Créer le compte",
  "auth.forgot.heading":
    'Retablissez votre accès <span class="text-primary">Aria</span>',
  "auth.forgot.tagline":
    "Nous enverrons un lien securise dans votre boîte de reception.<br />Utilisez-le une fois pour choisir un nouveau mot de passe.",
  "auth.forgot.title": "Mot de passe oublie",
  "auth.forgot.description":
    "Saisissez l'adresse courriel associee à votre compte.",
  "auth.reset.heading":
    'Choisissez un nouveau mot de passe <span class="text-primary">Aria</span>',
  "auth.reset.tagline":
    "Utilisez le lien securise recu par courriel.<br />Cette page ne fonctionne qu'une fois.",
  "auth.reset.title": "Réinitialiser le mot de passe",
  "auth.reset.description":
    "Definissez un nouveau mot de passe pour votre compte.",
  "auth.email": "Adresse courriel",
  "auth.enterEmail": "Saisissez votre courriel",
  "auth.backToSignIn": "Retour à la connexion",
  "auth.sending": "Envoi...",
  "auth.sendResetLink": "Envoyer le lien de reinitialisation",
  "auth.resetRequestAttention": "La demande requiert votre attention",
  "auth.checkInbox": "Vérifiez votre boîte de reception",
  "auth.resetAttention": "La reinitialisation requiert votre attention",
  "auth.passwordUpdated": "Mot de passe mis à jour",
  "auth.resetting": "Reinitialisation...",
  "auth.resetPassword": "Réinitialiser le mot de passe",
  "auth.newPassword": "Nouveau mot de passe",
  "auth.confirmPassword": "Confirmer le mot de passe",
  "auth.enterNewPassword": "Saisissez le nouveau mot de passe",
  "auth.confirmNewPassword": "Confirmez le nouveau mot de passe",
  "auth.minimumPasswordLength": "Au moins 7 caractères.",
  "auth.passwordsDoNotMatch": "Les mots de passe ne correspondent pas.",
  "auth.togglePasswordVisibility": "Afficher ou masquer le mot de passe",
  "auth.username": "Nom d'utilisateur",
  "auth.chooseUsername": "Choisissez un nom d'utilisateur",
  "auth.usernameHelp": "3 à 30 caractères, commence par une lettre.",
  "auth.emailRecoveryHelp":
    "Utilisée pour recuperer le compte après la configuration de l'envoi de courriels.",
  "auth.setupProgress": "Progression de la configuration",
  "auth.step.account": "Compte",
  "auth.step.passkey": "Clé d'accès",
  "auth.step.recovery": "Recuperation",
  "auth.recoveryPassword": "Mot de passe de recuperation",
  "auth.createRecoveryPassword":
    "Créez un mot de passe de recuperation robuste",
  "auth.confirmRecoveryPassword":
    "Confirmez votre mot de passe de recuperation",
  "auth.recovery.title": "Definissez un mot de passe de recuperation",
  "auth.recovery.description":
    "Votre solution de secours lorsqu'une clé d'accès est indisponible. Conservez-le en lieu sur.",
  "auth.passkey.title": "Preparez une connexion securisee",
  "auth.passkey.description":
    "Configurez votre clé d'accès pour un accès rapide depuis votre appareil. Votre mot de passe de recuperation protege votre compte.",
  "auth.usePasswordSetup": "Configurer plutot avec un mot de passe",
  "auth.passkey.unsupported.title": "Les clés d'accès seront bientot pretes",
  "auth.passkey.unsupported.description":
    "Terminez la configuration aujourd'hui, puis ajoutez la connexion par appareil dans les paramètres de sécurité.",
  "auth.passkey.insecure.title": "La connexion securisee exige HTTPS",
  "auth.passkey.insecure.description":
    "Terminez maintenant; la connexion par appareil pourra être ajoutee lorsque cet espace sera diffuse de maniere securisee.",
  "auth.passkey.ready.title": "Votre navigateur est pret",
  "auth.passkey.ready.description":
    "La connexion par appareil est la prochaine etape. Terminez pour ouvrir votre Studio.",
  "auth.passkey.success.title": "Clé d'accès créée",
  "auth.passkey.success.description":
    "Continuez pour ajouter le mot de passe de recuperation requis.",
  "auth.passkey.error.title": "Configuration de la clé d'accès interrompue",
  "auth.passkey.error.description":
    "Terminez maintenant et ajoutez des clés d'accès depuis les paramètres de sécurité plus tard.",
  "auth.passkey.pending.title": "En attente de votre appareil",
  "auth.passkey.pending.description":
    "Suivez l'invite du navigateur pour créer votre clé d'accès.",
  "auth.passkey.checking.title": "Vérification de cet appareil",
  "auth.passkey.checking.description":
    "Aria prepare la meilleure methode de connexion pour cet espace.",
  "auth.passkey.backend.title": "Les clés d'accès arrivent bientot",
  "auth.passkey.backend.description":
    "Créez votre compte administrateur maintenant; la connexion rapide par appareil s'integrera à ce flux.",
  "auth.passkeyUnavailable":
    "Les clés d'accès ne sont pas disponibles dans ce contexte de navigateur.",
  "auth.passkeySignInFailed": "Échec de connexion avec une clé d'accès",
  "auth.passkeySignInRetry":
    "Échec de connexion avec une clé d'accès. Reessayez ou utilisez votre mot de passe.",
  "auth.passkeySignInCancelled":
    "La connexion avec une clé d'accès a été annulee.",
  "auth.invalidForm": "Données de formulaire non valides",
  "auth.enterSixDigitCode": "Saisissez le code d'authentification à 6 chiffres",
  "auth.passkeySetupStartFailed":
    "Impossible de commencer la configuration de la clé d'accès",
  "auth.passkeySetupCancelled":
    "La configuration de la clé d'accès a été annulee. Reessayez lorsque vous serez pret.",
  "auth.passkeySetupRetry":
    "Échec de configuration de la clé d'accès. Reessayez ou utilisez un navigateur pris en charge.",
  "auth.createPasskeyFirst":
    "Créez une clé d'accès avant de configurer la recuperation.",
  "auth.createAccountFailed": "Impossible de créer le compte",
  "auth.validEmailRequired": "Une adresse courriel valide est requise",
  "auth.resetLinkSent":
    "Si cette adresse existe, un lien de reinitialisation a été envoye.",
  "auth.invalidResetRequest": "Demande de reinitialisation non valide",
  "auth.passwordResetSuccess":
    "Mot de passe réinitialisé. Redirection vers la connexion...",
  "auth.passkeySupportChecking":
    "Vérification de la prise en charge des clés d'accès...",
  "auth.passkeyUnsupported":
    "Ce navigateur ne prend pas en charge les clés d'accès. Utilisez plutot votre mot de passe.",
  "auth.passkeyRequiresHttps": "Les clés d'accès exigent HTTPS ou localhost.",
  "auth.passkeyDisabled":
    "La connexion par clé d'accès est désactivée pour cet espace. Utilisez plutot votre mot de passe.",
  "auth.passkeyAlternative":
    "Échec de connexion avec une clé d'accès. Reessayez ou choisissez une autre methode.",
  "auth.hidePasswordSignIn": "Masquer la connexion par mot de passe",
  "auth.showPasswordSignIn": "Se connecter avec un mot de passe",
  "auth.magicLinkUnavailable":
    "La connexion par lien magique requiert la configuration de l'envoi de courriels et arrivera à la phase 2.",
  "auth.identifierRequired": "Saisissez votre courriel ou votre nom d'utilisateur.",
  "auth.passwordRequired": "Saisissez votre mot de passe.",
  "auth.totpCodeInvalid": "Saisissez un code d'authentification à 6 chiffres.",
  "auth.usernameTooShort": "Le nom d'utilisateur doit comporter au moins 3 caractères.",
  "auth.usernameTooLong": "Le nom d'utilisateur doit comporter au plus 30 caractères.",
  "auth.usernameInvalid":
    "Le nom d'utilisateur doit commencer par une lettre et utiliser uniquement des lettres, des chiffres et des traits de soulignement.",
  "auth.captcha.loading": "Chargement de la vérification de sécurité. Veuillez patienter.",
  "auth.captcha.required": "Effectuez la vérification de sécurité.",
  "auth.captcha.loadFailed":
    "La vérification de sécurité n'a pas pu être chargée. Actualisez la page et réessayez.",
  "auth.captcha.failed": "La vérification de sécurité a échoué. Réessayez.",
  "auth.captcha.expired":
    "La vérification de sécurité a expiré. Effectuez-la de nouveau.",
  "auth.captcha.timedOut":
    "La vérification de sécurité a expiré. Réessayez.",
  "auth.captcha.unavailable":
    "Impossible de charger la vérification de sécurité. Actualisez la page et réessayez.",
  "auth.unexpectedError": "Un problème est survenu. Réessayez.",
  "auth.loginFailed": "Impossible de vous connecter. Vérifiez vos renseignements et réessayez.",
  "auth.invalidCredentials": "Le courriel, le nom d'utilisateur ou le mot de passe est incorrect.",
  "auth.twoFactorRequired": "Saisissez votre code d'authentification à deux facteurs.",
  "auth.twoFactorSetupRequired":
    "L'authentification à deux facteurs est requise pour ce compte. Communiquez avec un administrateur.",
  "auth.tooManyAttempts": "Trop de tentatives. Réessayez plus tard.",
  "auth.attemptsRemaining": "{{count}} tentatives restantes.",
  "auth.setupAlreadyCompleted": "La configuration est déjà terminée. Connectez-vous pour continuer.",
  "auth.passkeySetupExpired": "La configuration de la clé d'accès a expiré. Recommencez la configuration.",
} satisfies AuthMessageCatalog;
