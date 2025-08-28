#!/usr/bin/env node

const React = require("react");
const { render } = require("ink");
const App = require("../tui/app.js");

render(React.createElement(App));
