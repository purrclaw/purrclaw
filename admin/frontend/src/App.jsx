import React from "react";
import { Refine } from "@refinedev/core";
import { RefineThemes, ThemedLayout, ThemedSider, useNotificationProvider } from "@refinedev/antd";

import "@refinedev/antd/dist/reset.css";
import { ConfigProvider, App as AntApp } from "antd";
import dataProvider from "@refinedev/simple-rest";
import routerProvider, { NavigateToResource } from "@refinedev/react-router";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";

import {
  SettingOutlined,
  DatabaseOutlined,
  ControlOutlined,
  MessageOutlined,
  KeyOutlined,
} from "@ant-design/icons";

import { SettingsList, SettingsCreate, SettingsEdit } from "./pages/settings";
import { MemoryList, MemoryCreate, MemoryEdit } from "./pages/memory";
import { StateList, StateEdit } from "./pages/state";
import { SessionsList, SessionsShow } from "./pages/sessions";
import { MessagesList } from "./pages/messages";

const API_URL = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;

export default function App() {
  const notificationProvider = useNotificationProvider();

  return (
    <BrowserRouter>
      <ConfigProvider theme={RefineThemes.Blue}>
        <AntApp>
          <Refine
            dataProvider={dataProvider(API_URL)}
            routerProvider={routerProvider}
            notificationProvider={notificationProvider}
            resources={[
              {
                name: "settings",
                list:   "/settings",
                create: "/settings/create",
                edit:   "/settings/edit/:id",
                meta: { label: "Settings", icon: <SettingOutlined /> },
              },
              {
                name: "memory",
                list:   "/memory",
                create: "/memory/create",
                edit:   "/memory/edit/:id",
                meta: { label: "Memory", icon: <DatabaseOutlined /> },
              },
              {
                name: "state",
                list:   "/state",
                edit:   "/state/edit/:id",
                meta: { label: "State", icon: <ControlOutlined /> },
              },
              {
                name: "sessions",
                list:   "/sessions",
                show:   "/sessions/:id",
                meta: { label: "Sessions", icon: <KeyOutlined /> },
              },
              {
                name: "messages",
                list:   "/messages",
                meta: { label: "Messages", icon: <MessageOutlined /> },
              },
            ]}
            options={{ syncWithLocation: true }}
          >
            <Routes>
              <Route element={<ThemedLayout Sider={ThemedSider}><Outlet /></ThemedLayout>}>
                <Route index element={<NavigateToResource />} />

                <Route path="settings">
                  <Route index element={<SettingsList />} />
                  <Route path="create" element={<SettingsCreate />} />
                  <Route path="edit/:id" element={<SettingsEdit />} />
                </Route>

                <Route path="memory">
                  <Route index element={<MemoryList />} />
                  <Route path="create" element={<MemoryCreate />} />
                  <Route path="edit/:id" element={<MemoryEdit />} />
                </Route>

                <Route path="state">
                  <Route index element={<StateList />} />
                  <Route path="edit/:id" element={<StateEdit />} />
                </Route>

                <Route path="sessions">
                  <Route index element={<SessionsList />} />
                  <Route path=":id" element={<SessionsShow />} />
                </Route>

                <Route path="messages">
                  <Route index element={<MessagesList />} />
                </Route>
              </Route>
            </Routes>
          </Refine>
        </AntApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}
