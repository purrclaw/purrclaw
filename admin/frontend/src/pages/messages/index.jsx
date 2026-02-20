import React from "react";
import {
  useTable,
  List,
  DeleteButton,
  DateField,
  CreateButton,
  EditButton,
  ShowButton,
  Create,
  Edit,
  Show,
  useForm,
} from "@refinedev/antd";
import { useShow } from "@refinedev/core";
import { Table, Space, Typography, Tag, Input, Select, Form, InputNumber, Descriptions } from "antd";

const { Text, Paragraph } = Typography;

const ROLE_COLORS = {
  user: "blue",
  assistant: "green",
  tool: "orange",
  system: "purple",
};

const ROLE_OPTIONS = ["user", "assistant", "tool", "system"];

export function MessagesList() {
  const [search, setSearch] = React.useState("");
  const [role, setRole] = React.useState();
  const [sessionKey, setSessionKey] = React.useState("");

  const { tableProps, setFilters } = useTable({
    resource: "messages",
    sorters: { initial: [{ field: "id", order: "desc" }] },
    syncWithLocation: true,
  });

  React.useEffect(() => {
    const filters = [];
    if (search.trim()) {
      filters.push({ field: "q", operator: "eq", value: search.trim() });
    }
    if (role) {
      filters.push({ field: "role", operator: "eq", value: role });
    }
    if (sessionKey.trim()) {
      filters.push({ field: "session_key", operator: "contains", value: sessionKey.trim() });
    }
    setFilters(filters, "replace");
  }, [search, role, sessionKey, setFilters]);

  return (
    <List
      headerButtons={
        <Space>
          <Input.Search
            allowClear
            placeholder="Search messages"
            onSearch={setSearch}
            style={{ width: 260 }}
          />
          <Input
            allowClear
            placeholder="Session key contains"
            value={sessionKey}
            onChange={(e) => setSessionKey(e.target.value)}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            placeholder="Role"
            options={ROLE_OPTIONS.map((value) => ({ label: value, value }))}
            value={role}
            onChange={setRole}
            style={{ width: 140 }}
          />
          <CreateButton />
        </Space>
      }
    >
      <Table {...tableProps} rowKey="id" size="small">
        <Table.Column dataIndex="id" title="#" width={70} sorter />
        <Table.Column
          dataIndex="session_key"
          title="Session"
          width={260}
          render={(v) => <Text code style={{ fontSize: 11 }}>{v}</Text>}
        />
        <Table.Column
          dataIndex="role"
          title="Role"
          width={110}
          render={(v) => <Tag color={ROLE_COLORS[v] || "default"}>{v}</Tag>}
        />
        <Table.Column
          dataIndex="content"
          title="Content"
          render={(v) => (
            <Text ellipsis={{ tooltip: v }} style={{ maxWidth: 460, fontSize: 12 }}>
              {v || <Text type="secondary">—</Text>}
            </Text>
          )}
        />
        <Table.Column
          dataIndex="tool_call_id"
          title="Tool Call ID"
          width={200}
          render={(v) => (v ? <Text code>{v}</Text> : <Text type="secondary">—</Text>)}
        />
        <Table.Column dataIndex="created_at" title="Created" width={160} sorter render={(v) => <DateField value={v} />} />
        <Table.Column
          title="Actions"
          width={140}
          render={(_, r) => (
            <Space>
              <ShowButton hideText size="small" recordItemId={r.id} />
              <EditButton hideText size="small" recordItemId={r.id} />
              <DeleteButton hideText size="small" recordItemId={r.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
}

export function MessagesCreate() {
  const { formProps, saveButtonProps } = useForm({ resource: "messages", redirect: "list" });

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Session Key" name="session_key" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Role" name="role" rules={[{ required: true }]}>
          <Select options={ROLE_OPTIONS.map((value) => ({ label: value, value }))} />
        </Form.Item>
        <Form.Item label="Content" name="content" rules={[{ required: true }]}>
          <Input.TextArea rows={6} />
        </Form.Item>
        <Form.Item label="Tool Calls (JSON string)" name="tool_calls">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item label="Tool Call ID" name="tool_call_id">
          <Input />
        </Form.Item>
        <Form.Item label="Created At (ms timestamp)" name="created_at">
          <InputNumber style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Create>
  );
}

export function MessagesEdit() {
  const { formProps, saveButtonProps } = useForm({ resource: "messages", redirect: "list" });

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Session Key" name="session_key" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Role" name="role" rules={[{ required: true }]}>
          <Select options={ROLE_OPTIONS.map((value) => ({ label: value, value }))} />
        </Form.Item>
        <Form.Item label="Content" name="content" rules={[{ required: true }]}>
          <Input.TextArea rows={6} />
        </Form.Item>
        <Form.Item label="Tool Calls (JSON string)" name="tool_calls">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item label="Tool Call ID" name="tool_call_id">
          <Input />
        </Form.Item>
        <Form.Item label="Created At (ms timestamp)" name="created_at">
          <InputNumber style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Edit>
  );
}

export function MessagesShow() {
  const { query } = useShow({ resource: "messages" });
  const record = query?.data?.data;

  return (
    <Show isLoading={query?.isLoading}>
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="ID">{record?.id}</Descriptions.Item>
        <Descriptions.Item label="Session Key"><Text code>{record?.session_key}</Text></Descriptions.Item>
        <Descriptions.Item label="Role"><Tag color={ROLE_COLORS[record?.role] || "default"}>{record?.role}</Tag></Descriptions.Item>
        <Descriptions.Item label="Created"><DateField value={record?.created_at} /></Descriptions.Item>
        <Descriptions.Item label="Tool Call ID">{record?.tool_call_id || "—"}</Descriptions.Item>
        <Descriptions.Item label="Content"><Paragraph>{record?.content || "—"}</Paragraph></Descriptions.Item>
        <Descriptions.Item label="Tool Calls JSON"><Paragraph copyable>{record?.tool_calls || "—"}</Paragraph></Descriptions.Item>
      </Descriptions>
    </Show>
  );
}
