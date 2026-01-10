import React from 'react';
import Layout from '@theme-original/Layout';

export default function LayoutWrapper(props) {
  return (
    <div className="sb-layout">
      <Layout {...props} />
    </div>
  );
}
