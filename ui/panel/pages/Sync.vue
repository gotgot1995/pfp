<!--
 - This Source Code is subject to the terms of the Mozilla Public License
 - version 2.0 (the "License"). You can obtain a copy of the License at
 - http://mozilla.org/MPL/2.0/.
 -->

<template>
  <div class="page">
    <template v-if="$app.sync.provider">
      <div>{{ $t("sync_provider") }}</div>
      <div>{{ labelForProvider($app.sync.provider) }}</div>

      <div class="block-start">{{ $t("sync_lastTime") }}</div>
      <div class="sync-lastTime-container">
        <div v-if="$app.sync.isSyncing">{{ $t("sync_lastTime_now") }}</div>
        <div v-else-if="$app.sync.lastSync">{{ new Date($app.sync.lastSync).toLocaleString() }}</div>
        <div v-else>{{ $t("sync_lastTime_never") }}</div>

        <template v-if="$app.sync.lastSync && !$app.sync.isSyncing">
          <div v-if="$app.sync.error" class="sync-failed">{{ $t("sync_failed") }}</div>
          <div v-else class="sync-succeeded">{{ $t("sync_succeeded") }}</div>
        </template>
        <div class="sync-button-container">
          <button v-focus :disabled="$app.sync.isSyncing" @click="doSync">{{ $t("do_sync") }}</button>
        </div>
      </div>

      <div v-if="$app.sync.error" class="warning sync-error">
        {{ localize($app.sync.error) }}
        <a v-if="$app.sync.error == 'sync_invalid_token'" href="#" @click.prevent="authorize($app.sync.provider)">
          {{ $t("sync_reauthorize") }}
        </a>
      </div>
      <div class="button-container">
        <button @click="disableSync">{{ $t("sync_disable") }}</button>
        <button v-cancel @click="$app.currentPage = 'password-list'">{{ $t("cancel") }}</button>
      </div>
    </template>
    <template v-else>
      <div class="sync-section">{{ $t("sync_selection_label") }}</div>
      <div class="sync-provider-selection">
        <a v-for="(provider, index) in providers" :key="provider.name"
           v-focus="index == 0" class="sync-provider-link" :class="provider.name"
           href="#" :title="provider.label"
           @click.prevent="authorize(provider.name)"
        />
      </div>

      <div class="block-start sync-section">{{ $t("sync_how_label") }}</div>
      <div class="sync-explanation">
        {{ $t("sync_how_explanation") }}
        <external-link type="documentation" param="sync">
          {{ $t("learn_more") }}
        </external-link>
      </div>

      <div class="block-start sync-section">{{ $t("sync_safe_label") }}</div>
      <div class="sync-explanation">{{ $t("sync_safe_explanation") }}</div>

      <div class="block-start sync-section">{{ $t("sync_no_account_label") }}</div>
      <div class="sync-explanation">{{ $t("sync_no_account_explanation") }}</div>

      <div class="button-container">
        <button v-cancel @click="$app.currentPage = 'password-list'">{{ $t("cancel") }}</button>
      </div>
    </template>

    <manual-auth v-if="authActive" ref="manualAuth" @cancel="authActive = false" />
  </div>
</template>

<script>
"use strict";

import {sync} from "../../proxy";
import ManualAuth from "../components/ManualAuth.vue";

export default {
  name: "Sync",
  components: {
    "manual-auth": ManualAuth
  },
  data()
  {
    return {
      providers: [
        {
          name: "dropbox",
          label: "Dropbox"
        },
        {
          name: "gdrive",
          label: "Google Drive"
        }
      ],
      urls: {},
      authActive: false
    };
  },
  mounted()
  {
    if (this.$isWebClient)
    {
      for (let {name: provider} of this.providers)
      {
        sync.getManualAuthURL(provider).then(url =>
        {
          this.urls[provider] = url;
        }).catch(this.$app.showUnknownError);
      }
    }
  },
  methods:
  {
    labelForProvider(name)
    {
      for (let provider of this.providers)
        if (provider.name == name)
          return provider.label;
      return name;
    },
    localize(error)
    {
      if (/\s/.test(error))
        return error;

      return this.$t(error) || error;
    },
    doSync()
    {
      sync.sync();
    },
    disableSync()
    {
      this.$app.confirm(this.$t("sync_disable_confirmation")).then(disable =>
      {
        if (disable)
        {
          sync.disable().then(() =>
          {
            this.$app.currentPage = "password-list";
          });
        }
      });
    },
    authorize(provider)
    {
      if (this.$isWebClient)
      {
        let url = this.urls.hasOwnProperty(provider) && this.urls[provider];
        if (!url)
          return;

        window.open(url, "_blank");

        this.authActive = true;
        this.$nextTick(() =>
        {
          this.$refs.manualAuth.callback = code =>
          {
            return sync.manualAuthorization(provider, code).catch(this.$app.showUnknownError);
          };
        });
      }
      else
      {
        sync.authorize(provider);
        window.close();
      }
    }
  }
};
</script>