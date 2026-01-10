import React from 'react';
import MDXContent from '@theme-original/MDXContent';

export default function MDXContentWrapper(props) {
  return (
    <div className="sb-mdx">
      <MDXContent {...props} />
    </div>
  );
}
