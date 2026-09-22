import { Redirect } from 'expo-router';

import { authClient } from '@/api/auth-client';
import { ScreenLoader } from '@/ui/composites/ScreenLoader';

export default function Index() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <ScreenLoader />;
  }

  return <Redirect href={session ? '/(home)' : '/(auth)/login'} />;
}
