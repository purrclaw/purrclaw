import React from "react";
import { Refine } from "@refinedev/core";
import { RefineThemes, ThemedLayout, ThemedSider, useNotificationProvider } from "@refinedev/antd";

import "@refinedev/antd/dist/reset.css";
import { ConfigProvider, App as AntApp } from "antd";
import dataProvider from "@refinedev/simple-rest";
import routerProvider, { NavigateToResource } from "@refinedev/react-router";
import { BrowserRouter, Routes, Route, Outlet, Link } from "react-router-dom";

import {
  SettingOutlined,
  DatabaseOutlined,
  ControlOutlined,
  MessageOutlined,
  KeyOutlined,
  FileTextOutlined,
} from "@ant-design/icons";

import { SettingsList, SettingsCreate, SettingsEdit } from "./pages/settings";
import { MemoryList, MemoryCreate, MemoryEdit } from "./pages/memory";
import { StateList, StateCreate, StateEdit } from "./pages/state";
import { SessionsList, SessionsShow, SessionsCreate, SessionsEdit } from "./pages/sessions";
import { MessagesList, MessagesCreate, MessagesEdit, MessagesShow } from "./pages/messages";
import {
  ProfilesDocsList,
  ProfilesDocsCreate,
  ProfilesDocsEdit,
  ProfilesDocsShow,
} from "./pages/profiles-docs";

const API_URL = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;

function AdminTitle() {
  return (
    <Link to="/" style={{ color: "inherit", textDecoration: "none", fontWeight: 700, fontSize: 16 }}>
      PurrClaw Admin
    </Link>
  );
}

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
                list: "/settings",
                create: "/settings/create",
                edit: "/settings/edit/:id",
                meta: { label: "Settings", icon: <SettingOutlined /> },
              },
              {
                name: "memory",
                list: "/memory",
                create: "/memory/create",
                edit: "/memory/edit/:id",
                meta: { label: "Memory", icon: <DatabaseOutlined /> },
              },
              {
                name: "state",
                list: "/state",
                create: "/state/create",
                edit: "/state/edit/:id",
                meta: { label: "State", icon: <ControlOutlined /> },
              },
              {
                name: "sessions",
                list: "/sessions",
                show: "/sessions/:id",
                create: "/sessions/create",
                edit: "/sessions/edit/:id",
                meta: { label: "Sessions", icon: <KeyOutlined /> },
              },
              {
                name: "messages",
                list: "/messages",
                show: "/messages/:id",
                create: "/messages/create",
                edit: "/messages/edit/:id",
                meta: { label: "Messages", icon: <MessageOutlined /> },
              },
              {
                name: "profiles-docs",
                list: "/profiles-docs",
                show: "/profiles-docs/:id",
                create: "/profiles-docs/create",
                edit: "/profiles-docs/edit/:id",
                meta: { label: "Profiles Docs", icon: <FileTextOutlined /> },
              },
            ]}
            options={{ syncWithLocation: true }}
          >
            <Routes>
              <Route element={<ThemedLayout Sider={ThemedSider} Title={AdminTitle}><Outlet /></ThemedLayout>}>
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
                  <Route path="create" element={<StateCreate />} />
                  <Route path="edit/:id" element={<StateEdit />} />
                </Route>

                <Route path="sessions">
                  <Route index element={<SessionsList />} />
                  <Route path="create" element={<SessionsCreate />} />
                  <Route path="edit/:id" element={<SessionsEdit />} />
                  <Route path=":id" element={<SessionsShow />} />
                </Route>

                <Route path="messages">
                  <Route index element={<MessagesList />} />
                  <Route path="create" element={<MessagesCreate />} />
                  <Route path="edit/:id" element={<MessagesEdit />} />
                  <Route path=":id" element={<MessagesShow />} />
                </Route>

                <Route path="profiles-docs">
                  <Route index element={<ProfilesDocsList />} />
                  <Route path="create" element={<ProfilesDocsCreate />} />
                  <Route path="edit/:id" element={<ProfilesDocsEdit />} />
                  <Route path=":id" element={<ProfilesDocsShow />} />
                </Route>
              </Route>
            </Routes>
          </Refine>
        </AntApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}
