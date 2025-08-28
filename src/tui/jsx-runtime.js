import React from 'react';

export const jsx = (type, props, ...children) => {
  return React.createElement(type, props, ...children);
};

export const jsxs = jsx;