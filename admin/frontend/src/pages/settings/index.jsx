import React from "react";
import {
  useTable,
  List,
  CreateButton,
  EditButton,
  DeleteButton,
  DateField,
  Create,
  useForm,
  Edit,
} from "@refinedev/antd";
import { Table, Input, Space, Typography, Form } from "antd";

const { Text } = Typography;

export function SettingsList() {
  const [search, setSearch] = React.useState("");
  const { tableProps, setFilters } = useTable({
    resource: "settings",
    sorters: { initial: [{ field: "updated_at", order: "desc" }] },
    syncWithLocation: true,
  });

  React.useEffect(() => {
    const next = search.trim() ? [{ field: "q", operator: "eq", value: search.trim() }] : [];
    setFilters(next, "replace");
  }, [search, setFilters]);

  return (
    <List
      headerButtons={
        <Space>
          <Input.Search allowClear placeholder="Search settings" onSearch={setSearch} style={{ width: 260 }} />
          <CreateButton />
        </Space>
      }
    >
      <Table {...tableProps} rowKey="id" size="small">
        <Table.Column dataIndex="key" title="Key" width={280} sorter render={(v) => <Text code>{v}</Text>} />
        <Table.Column
          dataIndex="value"
          title="Value"
          render={(v) => (
            <Text ellipsis={{ tooltip: v }} style={{ maxWidth: 360 }}>
              {v || <Text type="secondary">—</Text>}
            </Text>
          )}
        />
        <Table.Column dataIndex="description" title="Description" render={(v) => v || <Text type="secondary">—</Text>} />
        <Table.Column dataIndex="updated_at" title="Updated" width={160} sorter render={(v) => <DateField value={v} />} />
        <Table.Column
          title="Actions"
          width={120}
          render={(_, record) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <DeleteButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
}

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
