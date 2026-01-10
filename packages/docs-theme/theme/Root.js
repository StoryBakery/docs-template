import React, {useEffect} from 'react';
import Root from '@theme-original/Root';

export default function RootWrapper(props) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.sbTheme = 'storybakery';
    return () => {
      delete root.dataset.sbTheme;
    };
  }, []);

  return <Root {...props} />;
}
