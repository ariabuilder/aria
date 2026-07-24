export const EN_SECURITY_MESSAGES = {
  "security.settings": "Security settings",
  "security.disabled": "Disabled",
  "security.passkeys.title": "Passkeys",
  "security.passkeys.description":
    "Use device-based sign-in for setup, login, and account recovery.",
  "security.passkeys.warning":
    "Disable only for airgapped environments that cannot use WebAuthn.",
  "security.passkeys.signIn": "Passkey sign-in",
  "security.passkeys.enabled": "New setup and sign-in can use passkeys.",
  "security.passkeys.disabled": "Setup falls back to password-only mode.",
  "security.passkeys.workspaceName": "Workspace name",
  "security.passkeys.currentRpId": "Current RP ID",
  "security.passkeys.allowedOrigins": "Allowed origins",
  "security.passkeys.saved": "Passkey settings saved",
  "security.passkeys.loadFailed": "Failed to load auth methods",
  "security.passkeys.saveFailed": "Failed to save auth methods",
  "security.twoFactor.title": "Two-Factor Authentication",
  "security.twoFactor.description":
    "Require all users to have two-factor authentication enabled.",
  "security.twoFactor.help":
    "When turned on, users without 2FA will be prompted to set it up on their next login.",
  "security.twoFactor.enforce": "Enforce for all users",
  "security.twoFactor.required": "2FA is required for every account.",
  "security.twoFactor.optional": "Users can choose whether to enable 2FA.",
  "security.captcha.title": "Login Protection",
  "security.captcha.description":
    "Require Turnstile verification before password sign-ins.",
  "security.captcha.provider": "CAPTCHA Provider",
  "security.captcha.selectProvider": "Select provider",
  "security.captcha.none": "No CAPTCHA verification",
  "security.captcha.turnstile": "Privacy-focused, free",
  "security.captcha.siteKey": "Site Key",
  "security.captcha.siteKeyPlaceholder": "Enter your site key",
  "security.captcha.allowedHostnames": "Allowed hostnames",
  "security.captcha.allowedHostnamesPlaceholder": "admin.example.com\nexample.com",
  "security.captcha.allowedHostnamesHelp": "One hostname per line. Do not include a protocol, path, wildcard, or port.",
  "security.captcha.secretStatus": "Worker secret",
  "security.captcha.secretConfigured": "A verification secret is configured securely in this Worker.",
  "security.captcha.managedSecretConfigured": "Aria encrypted this widget's verification secret; it is never shown in settings.",
  "security.captcha.secretMissing": "Create a managed widget or configure a verification secret before enabling Turnstile.",
  "security.captcha.managedSetup": "Set up Turnstile",
  "security.captcha.managedSetupHelp": "Aria will create a Turnstile widget for these hostnames. Your Cloudflare token stays private.",
  "security.captcha.createManaged": "Create managed widget",
  "security.captcha.replaceManaged": "Create replacement widget",
  "security.captcha.managedUnavailable": "Add a Cloudflare API token and encryption key to enable this.",
  "security.captcha.managedEncryptionMissing": "Cloudflare API token detected. Add Aria's encryption key once to finish setup.",
  "security.captcha.saved": "Settings saved",
  "security.captcha.save": "Save Settings",
  "security.captcha.saveFailed": "Failed to save CAPTCHA settings",
} as const;

export type SecurityMessageKey = keyof typeof EN_SECURITY_MESSAGES;
export type SecurityMessageCatalog = Record<SecurityMessageKey, string>;

export const FR_SECURITY_MESSAGES = {
  "security.settings": "Paramètres de sécurité",
  "security.disabled": "Désactivé",
  "security.passkeys.title": "Clés d'accès",
  "security.passkeys.description":
    "Utilisez la connexion depuis l'appareil pour la configuration, la connexion et la recuperation du compte.",
  "security.passkeys.warning":
    "Desactivez uniquement pour les environnements isoles qui ne peuvent pas utiliser WebAuthn.",
  "security.passkeys.signIn": "Connexion par clé d'accès",
  "security.passkeys.enabled":
    "La configuration et la connexion peuvent utiliser les clés d'accès.",
  "security.passkeys.disabled":
    "La configuration utilisé uniquement le mot de passe.",
  "security.passkeys.workspaceName": "Nom de l'espace de travail",
  "security.passkeys.currentRpId": "ID RP actuel",
  "security.passkeys.allowedOrigins": "Origines autorisees",
  "security.passkeys.saved": "Paramètres des clés d'accès enregistrés",
  "security.passkeys.loadFailed":
    "Impossible de charger les methodes d'authentification",
  "security.passkeys.saveFailed":
    "Impossible d'enregistrer les methodes d'authentification",
  "security.twoFactor.title": "Authentification à deux facteurs",
  "security.twoFactor.description":
    "Exigez l'authentification à deux facteurs pour tous les utilisateurs.",
  "security.twoFactor.help":
    "Une fois activee, les utilisateurs sans A2F seront invites à la configurer à leur prochaine connexion.",
  "security.twoFactor.enforce": "Appliquer à tous les utilisateurs",
  "security.twoFactor.required": "L'A2F est requise pour chaque compte.",
  "security.twoFactor.optional":
    "Les utilisateurs peuvent choisir d'activer l'A2F.",
  "security.captcha.title": "Protection de connexion",
  "security.captcha.description":
    "Exigez la vérification Turnstile avant les connexions par mot de passe.",
  "security.captcha.provider": "Fournisseur CAPTCHA",
  "security.captcha.selectProvider": "Sélectionner un fournisseur",
  "security.captcha.none": "Aucune vérification CAPTCHA",
  "security.captcha.turnstile": "Respectueux de la vie privée et gratuit",
  "security.captcha.siteKey": "Clé de site",
  "security.captcha.siteKeyPlaceholder": "Saisissez votre clé de site",
  "security.captcha.allowedHostnames": "Noms d'hôte autorisés",
  "security.captcha.allowedHostnamesPlaceholder": "admin.example.com\nexample.com",
  "security.captcha.allowedHostnamesHelp": "Un nom d'hôte par ligne, sans protocole, chemin, joker ni port.",
  "security.captcha.secretStatus": "Secret Worker",
  "security.captcha.secretConfigured": "Un secret de vérification est configuré de manière sécurisée dans ce Worker.",
  "security.captcha.managedSecretConfigured": "Aria a chiffré le secret de vérification de ce widget ; il n'est jamais affiché dans les paramètres.",
  "security.captcha.secretMissing": "Créez un widget géré ou configurez un secret de vérification avant d'activer Turnstile.",
  "security.captcha.managedSetup": "Configurer Turnstile",
  "security.captcha.managedSetupHelp": "Aria créera un widget Turnstile pour ces noms d'hôte. Votre jeton Cloudflare reste privé.",
  "security.captcha.createManaged": "Créer un widget géré",
  "security.captcha.replaceManaged": "Créer un widget de remplacement",
  "security.captcha.managedUnavailable": "Ajoutez un jeton API Cloudflare et une clé de chiffrement pour activer cette option.",
  "security.captcha.managedEncryptionMissing": "Jeton API Cloudflare détecté. Ajoutez une fois la clé de chiffrement d'Aria pour terminer la configuration.",
  "security.captcha.saved": "Paramètres enregistrés",
  "security.captcha.save": "Enregistrer les paramètres",
  "security.captcha.saveFailed":
    "Impossible d'enregistrer les paramètres CAPTCHA",
} satisfies SecurityMessageCatalog;
