export const es = {
  common: {
    loading: 'Cargando...',
    error: 'Error',
    retry: 'Reintentar',
    cancel: 'Cancelar',
  },
  auth: {
    loginTitle: 'Guardian',
    loginSubtitle: 'Accede con tu email',
    emailLabel: 'Email',
    emailPlaceholder: 'tu@email.com',
    sendCode: 'Enviar código',
    resendCode: 'Reenviar código',
    verifying: 'Verificando...',
    verifyTitle: 'Introduce el código',
    verifySubtitle: 'Te hemos enviado un código de 6 dígitos',
    invalidCode: 'Código incorrecto',
    logout: 'Cerrar sesión',
  },
  home: {
    title: 'Guardian',
    statusArmed: 'ARMADO',
    statusTrip: 'VIAJE AUTORIZADO',
    statusAlert: 'ALERTA',
    startTrip: 'Iniciar viaje',
    endTrip: 'Finalizar viaje',
    events: 'Eventos recientes',
    noEvents: 'Sin eventos',
  },
};

export type Translation = typeof es;
