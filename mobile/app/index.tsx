import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';

import { authClient } from '@/api/auth-client';

export default function Index() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0b0d10', justifyContent: 'center' }}>
        <ActivityIndicator color="#b45309" />
      </View>
    );
  }

  return <Redirect href={session ? '/(home)' : '/(auth)/login'} />;
}
