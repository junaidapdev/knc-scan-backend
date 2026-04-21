export const ERROR_CODES = {
  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PHONE_INVALID: 'PHONE_INVALID',
  INVALID_BILL_AMOUNT: 'INVALID_BILL_AMOUNT',

  // OTP
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_RATE_LIMIT: 'OTP_RATE_LIMIT',

  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // Customers
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  CUSTOMER_ALREADY_EXISTS: 'CUSTOMER_ALREADY_EXISTS',

  // Branches
  BRANCH_NOT_FOUND: 'BRANCH_NOT_FOUND',
  BRANCH_INACTIVE: 'BRANCH_INACTIVE',

  // Scans / business rules
  SCAN_LOCKOUT_ACTIVE: 'SCAN_LOCKOUT_ACTIVE',

  // Rewards
  REWARD_NOT_FOUND: 'REWARD_NOT_FOUND',
  REWARD_NOT_PENDING: 'REWARD_NOT_PENDING',
  REWARD_EXPIRED: 'REWARD_EXPIRED',
  REWARD_CATALOG_EMPTY: 'REWARD_CATALOG_EMPTY',
  REWARD_NOT_OWNED: 'REWARD_NOT_OWNED',
  CATALOG_CODE_PREFIX_TAKEN: 'CATALOG_CODE_PREFIX_TAKEN',
  CATALOG_ITEM_NOT_FOUND: 'CATALOG_ITEM_NOT_FOUND',
  INVALID_REDEMPTION_TOKEN: 'INVALID_REDEMPTION_TOKEN',
  ADMIN_AUTH_REQUIRED: 'ADMIN_AUTH_REQUIRED',
  ADMIN_LOGIN_INVALID: 'ADMIN_LOGIN_INVALID',
  ADMIN_RATE_LIMIT: 'ADMIN_RATE_LIMIT',
  CUSTOMER_ALREADY_DELETED: 'CUSTOMER_ALREADY_DELETED',
  REWARD_ALREADY_VOIDED: 'REWARD_ALREADY_VOIDED',
  REWARD_NOT_VOIDABLE: 'REWARD_NOT_VOIDABLE',

  // Infra
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_NOT_READY: 'SERVICE_NOT_READY',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface BilingualMessage {
  en: string;
  ar: string;
}

export const ERROR_MESSAGES: Record<ErrorCode, BilingualMessage> = {
  [ERROR_CODES.VALIDATION_FAILED]: {
    en: 'One or more fields failed validation.',
    ar: 'فشل التحقق من صحة حقل واحد أو أكثر.',
  },
  [ERROR_CODES.PHONE_INVALID]: {
    en: 'The phone number is not a valid Saudi mobile number.',
    ar: 'رقم الهاتف ليس رقم جوال سعودي صالح.',
  },
  [ERROR_CODES.INVALID_BILL_AMOUNT]: {
    en: 'The bill amount is not valid.',
    ar: 'قيمة الفاتورة غير صحيحة.',
  },
  [ERROR_CODES.OTP_INVALID]: {
    en: 'The verification code is incorrect.',
    ar: 'رمز التحقق غير صحيح.',
  },
  [ERROR_CODES.OTP_EXPIRED]: {
    en: 'The verification code has expired.',
    ar: 'انتهت صلاحية رمز التحقق.',
  },
  [ERROR_CODES.OTP_RATE_LIMIT]: {
    en: 'Too many verification attempts. Please try again later.',
    ar: 'عدد محاولات التحقق كثير جداً. الرجاء المحاولة لاحقاً.',
  },
  [ERROR_CODES.UNAUTHORIZED]: {
    en: 'Authentication required.',
    ar: 'المصادقة مطلوبة.',
  },
  [ERROR_CODES.FORBIDDEN]: {
    en: 'You do not have permission to perform this action.',
    ar: 'ليس لديك إذن لتنفيذ هذا الإجراء.',
  },
  [ERROR_CODES.CUSTOMER_NOT_FOUND]: {
    en: 'We could not find a customer with that phone number.',
    ar: 'لم نتمكن من العثور على عميل بهذا الرقم.',
  },
  [ERROR_CODES.CUSTOMER_ALREADY_EXISTS]: {
    en: 'A customer with that phone number already exists.',
    ar: 'يوجد عميل مسجل بهذا الرقم بالفعل.',
  },
  [ERROR_CODES.BRANCH_NOT_FOUND]: {
    en: 'The requested branch was not found.',
    ar: 'الفرع المطلوب غير موجود.',
  },
  [ERROR_CODES.BRANCH_INACTIVE]: {
    en: 'This branch is not currently active.',
    ar: 'هذا الفرع غير نشط حالياً.',
  },
  [ERROR_CODES.SCAN_LOCKOUT_ACTIVE]: {
    en: 'A stamp was already recorded within the lockout window.',
    ar: 'تم تسجيل ختم بالفعل خلال فترة الإغلاق.',
  },
  [ERROR_CODES.REWARD_NOT_FOUND]: {
    en: 'The reward was not found.',
    ar: 'المكافأة غير موجودة.',
  },
  [ERROR_CODES.REWARD_NOT_PENDING]: {
    en: 'This reward is not available for redemption.',
    ar: 'هذه المكافأة غير متاحة للاستبدال.',
  },
  [ERROR_CODES.REWARD_EXPIRED]: {
    en: 'This reward has expired.',
    ar: 'انتهت صلاحية هذه المكافأة.',
  },
  [ERROR_CODES.REWARD_CATALOG_EMPTY]: {
    en: 'No rewards are currently available.',
    ar: 'لا توجد مكافآت متاحة حالياً.',
  },
  [ERROR_CODES.REWARD_NOT_OWNED]: {
    en: 'This reward does not belong to the authenticated customer.',
    ar: 'هذه المكافأة لا تعود للعميل المصادق.',
  },
  [ERROR_CODES.CATALOG_CODE_PREFIX_TAKEN]: {
    en: 'A catalog item with this code prefix already exists.',
    ar: 'يوجد عنصر في الكتالوج بهذا الرمز بالفعل.',
  },
  [ERROR_CODES.CATALOG_ITEM_NOT_FOUND]: {
    en: 'The requested catalog item was not found.',
    ar: 'عنصر الكتالوج المطلوب غير موجود.',
  },
  [ERROR_CODES.INVALID_REDEMPTION_TOKEN]: {
    en: 'The redemption token is missing, invalid, or expired.',
    ar: 'رمز الاسترداد مفقود أو غير صالح أو منتهي الصلاحية.',
  },
  [ERROR_CODES.ADMIN_AUTH_REQUIRED]: {
    en: 'Admin authentication is required.',
    ar: 'مطلوبة مصادقة المسؤول.',
  },
  [ERROR_CODES.ADMIN_LOGIN_INVALID]: {
    en: 'Invalid email or password.',
    ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  },
  [ERROR_CODES.ADMIN_RATE_LIMIT]: {
    en: 'Too many login attempts. Please try again shortly.',
    ar: 'عدد محاولات تسجيل الدخول كبير. الرجاء المحاولة لاحقاً.',
  },
  [ERROR_CODES.CUSTOMER_ALREADY_DELETED]: {
    en: 'This customer has already been deleted.',
    ar: 'تم حذف هذا العميل بالفعل.',
  },
  [ERROR_CODES.REWARD_ALREADY_VOIDED]: {
    en: 'This reward has already been voided.',
    ar: 'تم إلغاء هذه المكافأة بالفعل.',
  },
  [ERROR_CODES.REWARD_NOT_VOIDABLE]: {
    en: 'Only pending rewards can be voided.',
    ar: 'يمكن إلغاء المكافآت المعلقة فقط.',
  },
  [ERROR_CODES.INTERNAL_ERROR]: {
    en: 'An unexpected error occurred.',
    ar: 'حدث خطأ غير متوقع.',
  },
  [ERROR_CODES.NOT_FOUND]: {
    en: 'The requested resource was not found.',
    ar: 'المورد المطلوب غير موجود.',
  },
  [ERROR_CODES.RATE_LIMITED]: {
    en: 'Too many requests. Please try again later.',
    ar: 'عدد الطلبات كبير جداً. الرجاء المحاولة لاحقاً.',
  },
  [ERROR_CODES.SERVICE_NOT_READY]: {
    en: 'The service is not ready to handle requests.',
    ar: 'الخدمة غير جاهزة لمعالجة الطلبات.',
  },
};
