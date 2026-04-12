import { AppsInToss } from '@apps-in-toss/framework';
import { PropsWithChildren } from 'react';
import { InitialProps } from '@granite-js/react-native';
import { context } from '../require.context';
import { TDSProvider } from '@toss/tds-react-native';

function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  return <TDSProvider>{children}</TDSProvider>;
}

export default AppsInToss.registerApp(AppContainer, { context });
