import React from "react";
import {
  useTable,
  List,
  Create,
  Edit,
  Show,
  useForm,
  CreateButton,
  EditButton,
  ShowButton,
  DeleteButton,
  DateField,
} from "@refinedev/antd";
import { useShow, useNotification } from "@refinedev/core";
import { Table, Space, Input, Typography, Form, Button, Descriptions } from "antd";

const { Text, Paragraph } = Typography;
const API_URL = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;

export function ProfilesDocsList() {
  const [search, setSearch] = React.useState("");
  const [isReadOnly, setIsReadOnly] = React.useState(false);
  const { open } = useNotification();

  const { tableProps, setFilters, tableQuery } = useTable({
    resource: "profiles-docs",
    sorters: { initial: [{ field: "updated_at", order: "desc" }] },
    syncWithLocation: true,
  });

  React.useEffect(() => {
    fetch(`${API_URL}/admin/meta`)
      .then((res) => res.json())
      .then((data) => setIsReadOnly(Boolean(data?.readOnly)))
      .catch(() => setIsReadOnly(false));
  }, []);

  React.useEffect(() => {
    const next = search.trim() ? [{ field: "q", operator: "eq", value: search.trim() }] : [];
    setFilters(next, "replace");
  }, [search, setFilters]);

  async function handleSync() {
    const response = await fetch(`${API_URL}/profiles-docs/sync`, { method: "POST" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Sync failed");
    }
    const result = await response.json();
    open?.({
      type: "success",
      message: "Profiles sync",
      description: `Scanned ${result.scanned}, updated ${result.synced}`,
    });
    await tableQuery.refetch();
  }

  return (
    <List
      headerButtons={
        <Space wrap>
          <Input.Search allowClear placeholder="Search profile docs" onSearch={setSearch} style={{ width: 280 }} />
          <Button onClick={handleSync} disabled={isReadOnly}>Sync from workspace/profiles</Button>
          <CreateButton disabled={isReadOnly} />
        </Space>
      }
    >
      <Table {...tableProps} rowKey="id" size="small">
        <Table.Column dataIndex="id" title="#" width={70} sorter />
        <Table.Column dataIndex="profile" title="Profile" width={180} sorter />
        <Table.Column dataIndex="file_name" title="File" width={180} sorter render={(v) => <Text code>{v}</Text>} />
        <Table.Column dataIndex="source_path" title="Source Path" width={280} render={(v) => <Text code>{v}</Text>} />
        <Table.Column
          dataIndex="content"
          title="Content"
          render={(v) => (
            <Text ellipsis={{ tooltip: v }} style={{ maxWidth: 420 }}>
              {v || <Text type="secondary">—</Text>}
            </Text>
          )}
        />
        <Table.Column dataIndex="updated_at" title="Updated" width={160} sorter render={(v) => <DateField value={v} />} />
        <Table.Column
          title="Actions"
          width={170}
          render={(_, record) => (
            <Space>
              <ShowButton hideText size="small" recordItemId={record.id} />
              <EditButton hideText size="small" recordItemId={record.id} disabled={isReadOnly} />
              <DeleteButton
                hideText
                size="small"
                recordItemId={record.id}
                disabled={isReadOnly}
                confirmTitle="Delete profile doc record?"
                confirmOkText="Delete"
                confirmCancelText="Cancel"
              />
            </Space>
          )}
        />
      </Table>
    </List>
  );
}

export function ProfilesDocsCreate() {
  const { formProps, saveButtonProps } = useForm({ resource: "profiles-docs", redirect: "list" });

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Profile" name="profile" rules={[{ required: true }]}>
          <Input placeholder="telegram_user" />
        </Form.Item>
        <Form.Item label="File Name" name="file_name" rules={[{ required: true }]}>
          <Input placeholder="AGENT.md" />
        </Form.Item>
        <Form.Item label="Source Path" name="source_path" rules={[{ required: true }]}>
          <Input placeholder="telegram_user/AGENT.md" />
        </Form.Item>
        <Form.Item label="Content" name="content" rules={[{ required: true }]}>
          <Input.TextArea rows={14} />
        </Form.Item>
      </Form>
    </Create>
  );
}

export function ProfilesDocsEdit() {
  const { formProps, saveButtonProps } = useForm({ resource: "profiles-docs", redirect: "list" });

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Profile" name="profile" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="File Name" name="file_name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Source Path" name="source_path" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Content" name="content" rules={[{ required: true }]}>
          <Input.TextArea rows={16} />
        </Form.Item>
      </Form>
    </Edit>
  );
}

export function ProfilesDocsShow() {
  const { query } = useShow({ resource: "profiles-docs" });
  const record = query?.data?.data;

  return (
    <Show isLoading={query?.isLoading}>
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="ID">{record?.id}</Descriptions.Item>
        <Descriptions.Item label="Profile">{record?.profile}</Descriptions.Item>
        <Descriptions.Item label="File"><Text code>{record?.file_name}</Text></Descriptions.Item>
        <Descriptions.Item label="Source Path"><Text code>{record?.source_path}</Text></Descriptions.Item>
        <Descriptions.Item label="Source MTime">{record?.source_mtime || 0}</Descriptions.Item>
        <Descriptions.Item label="Updated"><DateField value={record?.updated_at} /></Descriptions.Item>
        <Descriptions.Item label="Content"><Paragraph copyable>{record?.content || "—"}</Paragraph></Descriptions.Item>
      </Descriptions>
    </Show>
  );
}
