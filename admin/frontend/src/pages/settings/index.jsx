import React from "react";
import {
  useTable,
  List,
  CreateButton,
  EditButton,
  DeleteButton,
  DateField,
} from "@refinedev/antd";
import { Table, Input, Space, Typography } from "antd";
const { Text } = Typography;

// ─── List ─────────────────────────────────────────────────────────────────────

export function SettingsList() {
  const { tableProps } = useTable({ resource: "settings", syncWithLocation: true });

  return (
    <List headerButtons={<CreateButton />}>
      <Table {...tableProps} rowKey="id" size="small">
        <Table.Column dataIndex="key" title="Key" width={280}
          render={(v) => <Text code>{v}</Text>} />
        <Table.Column dataIndex="value" title="Value"
          render={(v) => (
            <Text ellipsis={{ tooltip: v }} style={{ maxWidth: 360 }}>
              {v || <Text type="secondary">—</Text>}
            </Text>
          )} />
        <Table.Column dataIndex="description" title="Description"
          render={(v) => v || <Text type="secondary">—</Text>} />
        <Table.Column dataIndex="updated_at" title="Updated"
          render={(v) => <DateField value={v} />} />
        <Table.Column title="Actions" width={120}
          render={(_, record) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <DeleteButton hideText size="small" recordItemId={record.id} />
            </Space>
          )} />
      </Table>
    </List>
  );
}

// ─── Create ───────────────────────────────────────────────────────────────────

import { Create, useForm } from "@refinedev/antd";
import { Form } from "antd";

export function SettingsCreate() {
  const { formProps, saveButtonProps } = useForm({ resource: "settings", redirect: "list" });
  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Key (env variable name)" name="key" rules={[{ required: true }]}>
          <Input placeholder="e.g. TELEGRAM_BOT_TOKEN" />
        </Form.Item>
        <Form.Item label="Value" name="value" rules={[{ required: true }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input placeholder="Brief description of what this setting does" />
        </Form.Item>
      </Form>
    </Create>
  );
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

import { Edit } from "@refinedev/antd";

export function SettingsEdit() {
  const { formProps, saveButtonProps, query } = useForm({ resource: "settings", redirect: "list" });
  const record = query?.data?.data;

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Key">
          <Input value={record?.key} disabled />
        </Form.Item>
        <Form.Item label="Value" name="value" rules={[{ required: true }]}>
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input />
        </Form.Item>
      </Form>
    </Edit>
  );
}
